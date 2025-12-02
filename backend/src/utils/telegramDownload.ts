import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import type { TelegramClient } from "telegram";
import type { Api } from "telegram";
import { Logger } from "./logger";

// Используем process.cwd() для определения корня проекта (backend/)
// Это работает и в dev режиме (ts-node-dev), и после компиляции (dist/)
const TMP_DIR = path.join(process.cwd(), "tmp");
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/**
 * Создаёт временную директорию, если её нет
 */
async function ensureTmpDir(): Promise<void> {
  try {
    await fs.access(TMP_DIR);
    // Папка существует, не логируем (можно использовать Logger.info для отладки)
  } catch {
    await fs.mkdir(TMP_DIR, { recursive: true });
    Logger.info("Created tmp directory", { path: TMP_DIR });
  }
}

/**
 * Скачивает видео из Telegram во временную папку
 * @param client - Telegram клиент
 * @param messageId - ID сообщения с видео (опционально, если не указан - ищет последнее)
 * @param chatId - ID чата (например, SYNX_CHAT_ID)
 * @returns Путь к временному файлу и имя файла
 */
export async function downloadTelegramVideoToTemp(
  client: TelegramClient,
  chatId: string | number,
  messageId?: number
): Promise<{ tempPath: string; fileName: string; messageId: number }> {
  await ensureTmpDir();

  let videoMessage: Api.Message;

  try {
    // Если указан messageId, получаем конкретное сообщение
    if (messageId) {
      Logger.info("Fetching specific message from Telegram", {
        chatId,
        messageId
      });

      try {
        const messages = await Promise.race([
          client.getMessages(chatId, {
            ids: [messageId]
          }) as Promise<Api.Message[]>,
          new Promise<Api.Message[]>((_, reject) => 
            setTimeout(() => reject(new Error("Get messages timeout after 30 seconds")), 30000)
          )
        ]);

        if (messages.length === 0) {
          throw new Error(
            `Message with ID ${messageId} not found in chat ${chatId}`
          );
        }

        videoMessage = messages[0];
      } catch (getMsgError: any) {
        const errorMsg = String(getMsgError?.message ?? getMsgError);
        if (errorMsg.includes("timeout") || errorMsg.includes("TIMEOUT")) {
          throw new Error(
            "TELEGRAM_TIMEOUT: Превышено время ожидания получения сообщения. " +
            "Проверьте подключение к интернету и попробуйте ещё раз."
          );
        }
        throw getMsgError;
      }
    } else {
      // Ищем последнее видео в чате
      Logger.info("Searching for latest video in Telegram chat", {
        chatId,
        limit: 50
      });

      let messages: Api.Message[];
      try {
        messages = await Promise.race([
          client.getMessages(chatId, {
            limit: 50
          }) as Promise<Api.Message[]>,
          new Promise<Api.Message[]>((_, reject) => 
            setTimeout(() => reject(new Error("Get messages timeout after 30 seconds")), 30000)
          )
        ]);
      } catch (getMsgError: any) {
        const errorMsg = String(getMsgError?.message ?? getMsgError);
        if (errorMsg.includes("timeout") || errorMsg.includes("TIMEOUT")) {
          throw new Error(
            "TELEGRAM_TIMEOUT: Превышено время ожидания получения сообщений. " +
            "Проверьте подключение к интернету и попробуйте ещё раз."
          );
        }
        throw getMsgError;
      }

      Logger.info(`Received ${messages.length} messages from Telegram chat`);

      // Фильтруем сообщения с видео
      const videoMessages = messages
        .filter((msg) => {
          try {
            // Проверяем наличие video attachment
            const hasVideo =
              "video" in msg &&
              (msg as any).video != null &&
              !(msg as any).video.deleted;

            // Проверяем наличие document с видео-атрибутом
            const doc = (msg as any).document;
            const hasDocVideo =
              doc != null &&
              Array.isArray(doc.attributes) &&
              doc.attributes.some(
                (attr: any) =>
                  attr?.className === "DocumentAttributeVideo" ||
                  attr?.className === "MessageMediaDocument"
              ) &&
              // Дополнительная проверка MIME типа для документов
              (doc.mimeType?.startsWith("video/") ||
                doc.mimeType === "application/octet-stream" ||
                doc.fileName?.match(/\.(mp4|avi|mov|mkv|webm)$/i));

            return hasVideo || hasDocVideo;
          } catch (filterError) {
            Logger.warn("Error filtering video message", {
              messageId: (msg as any).id,
              error: String(filterError)
            });
            return false;
          }
        })
        .sort((a, b) => {
          // Сортируем по дате (самое свежее первым)
          let dateA = 0;
          let dateB = 0;

          try {
            const msgA = a as any;
            const msgB = b as any;

            if (msgA.date) {
              dateA =
                msgA.date instanceof Date
                  ? msgA.date.getTime()
                  : typeof msgA.date === "number"
                    ? msgA.date * 1000
                    : new Date(msgA.date).getTime();
            } else if (msgA.id) {
              dateA = msgA.id;
            }

            if (msgB.date) {
              dateB =
                msgB.date instanceof Date
                  ? msgB.date.getTime()
                  : typeof msgB.date === "number"
                    ? msgB.date * 1000
                    : new Date(msgB.date).getTime();
            } else if (msgB.id) {
              dateB = msgB.id;
            }
          } catch (sortError) {
            Logger.warn("Error sorting messages by date", {
              error: String(sortError)
            });
          }

          return dateB - dateA; // Сортируем по убыванию (новые первыми)
        });

      if (videoMessages.length === 0) {
        throw new Error(
          "NO_VIDEO_FOUND: Видео ещё не готово в чате. Подождите окончания генерации и попробуйте ещё раз."
        );
      }

      videoMessage = videoMessages[0];
    }

    Logger.info("Video message found, preparing to download", {
      messageId: videoMessage.id,
      hasVideo: "video" in videoMessage,
      hasDocument: "document" in videoMessage
    });

    // Определяем имя файла из сообщения или используем дефолтное
    let originalFileName = "video.mp4";
    const doc = (videoMessage as any).document;
    if (doc?.fileName) {
      originalFileName = doc.fileName;
    } else if ((videoMessage as any).video) {
      originalFileName = `video_${videoMessage.id}.mp4`;
    }

    // Генерируем уникальное имя файла для временной папки
    // Используем timestamp и UUID для уникальности
    const fileExtension = path.extname(originalFileName) || ".mp4";
    const uniqueFileName = `${Date.now()}_${randomUUID().slice(0, 8)}${fileExtension}`;
    const tempPath = path.join(TMP_DIR, uniqueFileName);
    
    // Логируем полный путь для отладки
    Logger.info("Generated temp file path", {
      tmpDir: TMP_DIR,
      uniqueFileName,
      tempPath,
      absolutePath: path.resolve(tempPath)
    });

    Logger.info("Starting video download from Telegram to temp file", {
      messageId: videoMessage.id,
      tempPath,
      originalFileName
    });

    const downloadStartTime = Date.now();

    // Скачиваем файл в Buffer, затем записываем в файл
    // Это более надёжный способ, чем прямое скачивание в файл
    Logger.info("Downloading media to buffer", {
      messageId: videoMessage.id,
      tempPath
    });

    let fileBuffer: Buffer;
    try {
      // Добавляем таймаут для скачивания (5 минут для больших файлов)
      const downloadTimeout = 5 * 60 * 1000; // 5 минут
      
      fileBuffer = await Promise.race([
        client.downloadMedia(videoMessage, {}) as Promise<Buffer>,
        new Promise<Buffer>((_, reject) => 
          setTimeout(() => reject(new Error("Download timeout after 5 minutes")), downloadTimeout)
        )
      ]);
    } catch (downloadError: any) {
      const errorMessage = String(downloadError?.message ?? downloadError);
      
      Logger.error("Error during Telegram media download to buffer", {
        error: errorMessage,
        messageId: videoMessage.id,
        errorType: downloadError?.name
      });
      
      // Специальная обработка таймаутов
      if (errorMessage.includes("timeout") || errorMessage.includes("TIMEOUT")) {
        throw new Error(
          "TELEGRAM_DOWNLOAD_TIMEOUT: Превышено время ожидания скачивания видео. " +
          "Проверьте подключение к интернету и попробуйте ещё раз."
        );
      }
      
      throw new Error(
        `TELEGRAM_DOWNLOAD_ERROR: ${errorMessage || "Не удалось скачать видео из Telegram"}`
      );
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error(
        "TELEGRAM_DOWNLOAD_FAILED: Скачанный файл пуст или повреждён."
      );
    }

    // Записываем Buffer в файл
    Logger.info("Writing buffer to file", {
      tempPath,
      bufferSize: fileBuffer.length
    });

    await fs.writeFile(tempPath, fileBuffer);

    // Проверяем, что файл был создан и не пустой
    const stats = await fs.stat(tempPath);
    if (stats.size === 0) {
      await fs.unlink(tempPath).catch(() => {});
      throw new Error(
        "TELEGRAM_DOWNLOAD_FAILED: Скачанный файл пуст или повреждён."
      );
    }

    // Проверяем размер файла
    if (stats.size > MAX_FILE_SIZE) {
      await fs.unlink(tempPath).catch(() => {});
      throw new Error(
        `FILE_TOO_LARGE: Файл слишком большой (${(stats.size / (1024 * 1024)).toFixed(2)} MB). Максимальный размер: ${MAX_FILE_SIZE / (1024 * 1024)} MB.`
      );
    }

    const downloadDuration = Date.now() - downloadStartTime;
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    Logger.info("Video downloaded successfully to temp file", {
      messageId: videoMessage.id,
      tempPath,
      fileSizeBytes: stats.size,
      fileSizeMB,
      downloadDurationMs: downloadDuration,
      downloadSpeedMBps: (
        (stats.size / (1024 * 1024)) /
        (downloadDuration / 1000)
      ).toFixed(2)
    });

    return {
      tempPath,
      fileName: originalFileName,
      messageId: videoMessage.id as number
    };
  } catch (error: any) {
    const errorMessage = String(error?.message ?? error);

    Logger.error("Error downloading video from Telegram", {
      error: errorMessage,
      chatId,
      messageId
    });

    // Пробрасываем ошибку дальше с понятным сообщением
    if (errorMessage.includes("NO_VIDEO_FOUND")) {
      throw new Error(errorMessage);
    }

    if (errorMessage.includes("not found")) {
      throw new Error(
        `TELEGRAM_MESSAGE_NOT_FOUND: Сообщение с ID ${messageId} не найдено в чате.`
      );
    }

    throw new Error(
      `TELEGRAM_DOWNLOAD_ERROR: ${errorMessage || "Не удалось скачать видео из Telegram"}`
    );
  }
}

/**
 * Удаляет временный файл
 * @param tempPath - Путь к временному файлу
 */
export async function cleanupTempFile(tempPath: string): Promise<void> {
  try {
    await fs.unlink(tempPath);
    Logger.info("Temporary file deleted", { tempPath });
  } catch (error) {
    Logger.warn("Failed to delete temporary file", {
      tempPath,
      error: String(error)
    });
    // Не пробрасываем ошибку, так как это cleanup операция
  }
}

