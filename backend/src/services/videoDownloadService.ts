import { createTelegramClientFromStringSession } from "../telegram/client";
import { loadSessionString } from "../telegram/sessionStore";
import { downloadTelegramVideoToTemp, cleanupTempFile } from "../utils/telegramDownload";
import { uploadFileToDrive } from "./googleDrive";
import { uploadFileToDriveWithOAuth } from "./googleDriveOAuth";
import { getUserOAuthTokens, updateUserAccessToken } from "../repositories/userOAuthTokensRepo";
import { db, isFirestoreAvailable } from "./firebaseAdmin";
import { Logger } from "../utils/logger";
import { google } from "googleapis";
import { formatFileName } from "../utils/fileUtils";

const SYNX_CHAT_ID = process.env.SYNX_CHAT_ID;

export interface DownloadAndUploadOptions {
  channelId: string;
  userId: string;
  telegramMessageId?: number;
  videoTitle?: string;
  scheduleId?: string; // Для отслеживания автоматических загрузок
}

export interface DownloadAndUploadResult {
  success: boolean;
  driveFileId?: string;
  driveWebViewLink?: string;
  driveWebContentLink?: string;
  fileName?: string;
  error?: string;
}

/**
 * Скачивает видео из Telegram и загружает его в Google Drive
 * Используется как для ручной загрузки, так и для автоматической
 */
export async function downloadAndUploadVideoToDrive(
  options: DownloadAndUploadOptions
): Promise<DownloadAndUploadResult> {
  const { channelId, userId, telegramMessageId, videoTitle, scheduleId } = options;

  Logger.info("downloadAndUploadVideoToDrive: start", {
    channelId,
    userId,
    telegramMessageId,
    videoTitle: videoTitle || "not provided",
    scheduleId: scheduleId || "manual"
  });

  // Проверяем Telegram-сессию
  const stringSession = loadSessionString();
  if (!stringSession) {
    return {
      success: false,
      error: "Telegram-сеанс не настроен. Сначала подключите SyntX на backend (npm run dev:login)."
    };
  }

  if (!SYNX_CHAT_ID) {
    return {
      success: false,
      error: "SYNX_CHAT_ID is not configured on the server"
    };
  }

  // Проверяем доступность Firestore
  if (!isFirestoreAvailable() || !db) {
    Logger.error("Firestore is not available in downloadAndUploadVideoToDrive");
    return {
      success: false,
      error: "Firebase Admin не настроен"
    };
  }

  let tempFilePath: string | null = null;
  let telegramClient: any = null;

  try {
    // Проверяем, что пользователь имеет доступ к этому каналу и читаем данные канала
    const channelRef = db
      .collection("users")
      .doc(userId)
      .collection("channels")
      .doc(channelId);
    const channelSnap = await channelRef.get();

    if (!channelSnap.exists) {
      return {
        success: false,
        error: "Канал не найден"
      };
    }

    const channelData = channelSnap.data() as {
      name?: string;
      googleDriveFolderId?: string;
    };

    // Определяем папку для загрузки: сначала из канала, потом из .env
    const folderIdFromChannel = channelData.googleDriveFolderId?.trim() || undefined;
    const defaultFolderId = process.env.GOOGLE_DRIVE_DEFAULT_PARENT?.trim() || undefined;

    const finalFolderId = folderIdFromChannel || defaultFolderId;

    if (!finalFolderId) {
      return {
        success: false,
        error: "Не указана папка для загрузки. Укажите googleDriveFolderId в настройках канала или задайте GOOGLE_DRIVE_DEFAULT_PARENT в backend/.env"
      };
    }

    Logger.info("Determining Google Drive folder", {
      folderIdFromChannel: folderIdFromChannel || "not set",
      defaultFolderId: defaultFolderId || "not set",
      finalFolderId
    });

    // Создаём Telegram-клиент
    telegramClient = await createTelegramClientFromStringSession(stringSession);

    try {
      // Шаг 1: Скачиваем видео во временную папку
      // ВАЖНО: При автоматическом скачивании telegramMessageId - это ID промпта (текстового сообщения),
      // а не видео. Видео приходит позже. Поэтому передаём messageId как "маркер" для поиска видео ПОСЛЕ него,
      // но не пытаемся получить само сообщение с этим ID.
      Logger.info("Step 1: Downloading video from Telegram to temp folder", {
        chatId: SYNX_CHAT_ID,
        promptMessageId: telegramMessageId || "not specified",
        note: telegramMessageId 
          ? "Will search for video after this prompt message ID" 
          : "Will search for latest video in chat"
      });

      // Передаём messageId только как маркер для поиска видео после него
      // В downloadTelegramVideoToTemp это будет использовано для фильтрации сообщений
      const downloadResult = await downloadTelegramVideoToTemp(
        telegramClient,
        SYNX_CHAT_ID,
        telegramMessageId // Передаём как маркер, не как конкретное сообщение
      );

      tempFilePath = downloadResult.tempPath;

      Logger.info("Video downloaded to temp file", {
        tempPath: tempFilePath,
        fileName: downloadResult.fileName,
        messageId: downloadResult.messageId
      });

      // Шаг 2: Загружаем файл в Google Drive
      Logger.info("Step 2: Uploading file to Google Drive", {
        filePath: tempFilePath,
        folderId: finalFolderId
      });

      // Формируем имя файла для Google Drive из videoTitle или названия канала
      let driveFileName: string;
      
      if (videoTitle) {
        // Используем название ролика из запроса
        driveFileName = formatFileName(videoTitle);
        Logger.info("Using video title for file name", {
          originalTitle: videoTitle,
          sanitizedFileName: driveFileName
        });
      } else {
        // Fallback: используем название канала с timestamp
        const safeName =
          channelData.name?.replace(/[^\w\d\-]+/g, "_").slice(0, 50) ||
          `channel_${channelId}`;
        const timestamp = Date.now();
        driveFileName = `${safeName}_${timestamp}.mp4`;
        Logger.info("Using channel name for file name (videoTitle not provided)", {
          channelName: channelData.name,
          fileName: driveFileName
        });
      }

      // Пробуем использовать OAuth токен пользователя, если доступен
      let driveResult;
      try {
        const userTokens = await getUserOAuthTokens(userId);
        
        if (userTokens?.googleDriveAccessToken) {
          // Проверяем, не истёк ли токен
          const now = Date.now();
          const isExpired = userTokens.googleDriveTokenExpiry 
            ? userTokens.googleDriveTokenExpiry < now 
            : false;
          
          let accessToken = userTokens.googleDriveAccessToken;
          
          // Если токен истёк, обновляем его
          if (isExpired && userTokens.googleDriveRefreshToken) {
            Logger.info("OAuth token expired, refreshing...", { userId });
            
            const oauth2Client = new google.auth.OAuth2(
              process.env.GOOGLE_OAUTH_CLIENT_ID,
              process.env.GOOGLE_OAUTH_CLIENT_SECRET
            );
            oauth2Client.setCredentials({ refresh_token: userTokens.googleDriveRefreshToken });
            
            const { credentials } = await oauth2Client.refreshAccessToken();
            accessToken = credentials.access_token!;
            
            // Сохраняем обновлённый токен
            await updateUserAccessToken(
              userId,
              accessToken,
              credentials.expiry_date || Date.now() + 3600000
            );
            
            Logger.info("OAuth token refreshed", { userId });
          }
          
          // Используем OAuth токен для загрузки
          Logger.info("Using OAuth token for Google Drive upload", { userId });
          driveResult = await uploadFileToDriveWithOAuth({
            filePath: tempFilePath,
            fileName: driveFileName,
            mimeType: "video/mp4",
            parentFolderId: finalFolderId,
            accessToken: accessToken
          });
        } else {
          // Fallback: используем Service Account (может не работать для загрузки)
          Logger.warn("No OAuth token found, falling back to Service Account", { userId });
          driveResult = await uploadFileToDrive({
            filePath: tempFilePath,
            fileName: driveFileName,
            mimeType: "video/mp4",
            parentFolderId: finalFolderId
          });
        }
      } catch (oauthError: any) {
        // Если OAuth не работает, пробуем Service Account
        Logger.warn("OAuth upload failed, trying Service Account", {
          error: oauthError?.message,
          userId
        });
        
        try {
          driveResult = await uploadFileToDrive({
            filePath: tempFilePath,
            fileName: driveFileName,
            mimeType: "video/mp4",
            parentFolderId: finalFolderId
          });
        } catch (serviceAccountError: any) {
          // Если и Service Account не работает, пробрасываем ошибку
          throw new Error(
            `GOOGLE_DRIVE_UPLOAD_FAILED: Не удалось загрузить файл. ` +
            `OAuth ошибка: ${oauthError?.message}. ` +
            `Service Account ошибка: ${serviceAccountError?.message}. ` +
            `Пожалуйста, авторизуйтесь через Google OAuth: http://localhost:8080/api/auth/google`
          );
        }
      }

      Logger.info("File uploaded to Google Drive", {
        fileId: driveResult.fileId,
        webViewLink: driveResult.webViewLink
      });

      // Шаг 3: Удаляем временный файл
      Logger.info("Step 3: Cleaning up temporary file", {
        tempPath: tempFilePath
      });

      await cleanupTempFile(tempFilePath);
      tempFilePath = null; // Помечаем, что файл удалён

      // Шаг 4: Сохраняем информацию о видео в Firestore
      try {
        await channelRef.collection("generatedVideos").add({
          driveFileId: driveResult.fileId,
          driveWebViewLink: driveResult.webViewLink || null,
          driveWebContentLink: driveResult.webContentLink || null,
          createdAt: new Date(),
          source: scheduleId ? "auto-scheduled" : "manual",
          telegramMessageId: downloadResult.messageId,
          scheduleId: scheduleId || null
        });

        // Обновляем последнее видео в канале (опционально)
        await channelRef.update({
          lastVideoDriveFileId: driveResult.fileId,
          lastVideoDriveLink: driveResult.webViewLink || null,
          lastVideoUpdatedAt: new Date()
        });
      } catch (firestoreError) {
        Logger.warn("Failed to save video info to Firestore", {
          error: String(firestoreError)
        });
        // Не прерываем выполнение, так как файл уже загружен
      }

      Logger.info("Video successfully processed and uploaded to Google Drive", {
        fileId: driveResult.fileId,
        webViewLink: driveResult.webViewLink,
        scheduleId: scheduleId || "manual"
      });

      return {
        success: true,
        driveFileId: driveResult.fileId,
        driveWebViewLink: driveResult.webViewLink,
        driveWebContentLink: driveResult.webContentLink,
        fileName: driveFileName
      };
    } finally {
      // Отключаемся от Telegram
      try {
        if (telegramClient) {
          await telegramClient.disconnect();
        }
      } catch {
        // ignore
      }
    }
  } catch (err: any) {
    const errorMessage = String(err?.message ?? err);
    const errorStack = err?.stack;

    Logger.error("Error in downloadAndUploadVideoToDrive", {
      error: errorMessage,
      stack: errorStack,
      userId,
      channelId,
      tempFilePath,
      scheduleId
    });

    // Удаляем временный файл в случае ошибки
    if (tempFilePath) {
      Logger.warn("Cleaning up temp file after error", { tempFilePath });
      await cleanupTempFile(tempFilePath).catch((cleanupError) => {
        Logger.error("Failed to cleanup temp file after error", {
          tempPath: tempFilePath,
          error: String(cleanupError)
        });
      });
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

