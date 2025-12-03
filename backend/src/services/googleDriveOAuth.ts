import { google } from "googleapis";
import { Readable } from "stream";
import * as fs from "fs";
import { Logger } from "../utils/logger";

/**
 * Создаёт клиент Google Drive API, используя OAuth токен пользователя
 * @param accessToken - OAuth access token пользователя
 * @returns {google.drive_v3.Drive} Клиент Google Drive
 */
function getDriveClientFromOAuth(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  return google.drive({ version: "v3", auth });
}

/**
 * Загружает файл в Google Drive используя OAuth токен пользователя
 * @param params - Параметры загрузки
 * @returns Информация о загруженном файле
 */
export async function uploadFileToDriveWithOAuth(params: {
  filePath: string;
  fileName: string;
  mimeType?: string;
  parentFolderId: string;
  accessToken: string;
}): Promise<{ fileId: string; webViewLink?: string; webContentLink?: string }> {
  const { filePath, fileName, mimeType = "video/mp4", parentFolderId, accessToken } = params;

  // Проверяем, что файл существует
  try {
    await fs.promises.access(filePath);
  } catch {
    throw new Error(`FILE_NOT_FOUND: Файл не найден: ${filePath}`);
  }

  const drive = getDriveClientFromOAuth(accessToken);

  // Проверяем доступ к папке
  try {
    const folderInfo = await drive.files.get({
      fileId: parentFolderId,
      fields: "id, name, mimeType"
    });

    if (folderInfo.data.mimeType !== "application/vnd.google-apps.folder") {
      throw new Error("GOOGLE_DRIVE_NOT_A_FOLDER: Указанный ID не является папкой Google Drive.");
    }

    Logger.info("Folder validated for OAuth upload", {
      folderId: parentFolderId,
      folderName: folderInfo.data.name
    });
  } catch (error: any) {
    if (error?.code === 404) {
      throw new Error(
        `GOOGLE_DRIVE_FOLDER_NOT_FOUND: Папка не найдена (ID: ${parentFolderId}). Проверьте правильность ID папки.`
      );
    }
    if (error?.code === 403) {
      throw new Error(
        `GOOGLE_DRIVE_PERMISSION_DENIED: Нет доступа к папке. Убедитесь, что у вас есть права "Редактор" на эту папку.`
      );
    }
    throw error;
  }

  const stats = await fs.promises.stat(filePath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  Logger.info("Starting file upload to Google Drive with OAuth", {
    filePath,
    fileName,
    mimeType,
    parentFolderId,
    fileSizeBytes: stats.size,
    fileSizeMB
  });

  const uploadStartTime = Date.now();
  const fileStream = fs.createReadStream(filePath);

  try {
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [parentFolderId]
      },
      media: {
        mimeType,
        body: fileStream
      },
      fields: "id, name, webViewLink, webContentLink, size"
    });

    const file = res.data;
    const uploadDuration = Date.now() - uploadStartTime;

    Logger.info("File uploaded successfully to Google Drive with OAuth", {
      fileId: file.id,
      fileName: file.name,
      fileSize: file.size,
      webViewLink: file.webViewLink,
      uploadDurationMs: uploadDuration
    });

    return {
      fileId: file.id as string,
      webViewLink: file.webViewLink ?? undefined,
      webContentLink: file.webContentLink ?? undefined
    };
  } catch (error: any) {
    Logger.error("Failed to upload file to Google Drive with OAuth", {
      error: error?.message,
      errorCode: error?.code,
      fileName,
      parentFolderId
    });

    if (error?.code === 401) {
      throw new Error(
        "GOOGLE_DRIVE_OAUTH_INVALID: OAuth токен недействителен или истёк. Обновите токен."
      );
    }

    if (error?.code === 403) {
      throw new Error(
        `GOOGLE_DRIVE_PERMISSION_DENIED: Нет прав на загрузку в эту папку. Убедитесь, что у вас есть права "Редактор".`
      );
    }

    throw error;
  }
}

