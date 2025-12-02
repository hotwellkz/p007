import { generatePromptForChannel } from "./promptGenerator";
import { sendPromptFromUserToSyntx } from "./sendPromptFromUserToSyntx";
import { Logger } from "../utils/logger";

/**
 * Генерирует промпт для канала и отправляет его в Syntx-бот
 * @param channelId - ID канала
 * @param userId - ID владельца канала
 */
export async function generateAndSendPromptForChannel(
  channelId: string,
  userId: string
): Promise<void> {
  Logger.info("generateAndSendPromptForChannel: start", {
    channelId,
    userId
  });

  try {
    // Шаг 1: Генерируем промпт
    const { prompt, title } = await generatePromptForChannel(channelId, userId);
    Logger.info("Prompt generated", { channelId, promptLength: prompt.length, title });

    // Шаг 2: Отправляем в Syntx-бот
    await sendPromptFromUserToSyntx(userId, prompt);
    Logger.info("Prompt sent to Syntx", { channelId });

    // TODO: Опционально сохранить в БД лог отправки (channelId, time, promptPreview)
  } catch (error) {
    Logger.error("Failed to generate and send prompt", {
      channelId,
      userId,
      error
    });
    throw error;
  }
}

