import { generatePromptForChannel } from "./promptGenerator";
import { sendPromptFromUserToSyntx, type TelegramMessageInfo } from "./sendPromptFromUserToSyntx";
import { Logger } from "../utils/logger";

export interface PromptGenerationResult extends TelegramMessageInfo {
  title?: string;
  prompt: string;
}

/**
 * Генерирует промпт для канала и отправляет его в Syntx-бот
 * @param channelId - ID канала
 * @param userId - ID владельца канала
 * @returns Информация об отправленном сообщении (messageId, chatId) и сгенерированном title
 */
export async function generateAndSendPromptForChannel(
  channelId: string,
  userId: string
): Promise<PromptGenerationResult> {
  Logger.info("generateAndSendPromptForChannel: start", {
    channelId,
    userId
  });

  try {
    // Шаг 1: Генерируем промпт
    const { prompt, title } = await generatePromptForChannel(channelId, userId);
    Logger.info("Prompt generated", { channelId, promptLength: prompt.length, title });

    // Шаг 2: Отправляем в Syntx-бот
    const messageInfo = await sendPromptFromUserToSyntx(userId, prompt);
    Logger.info("Prompt sent to Syntx", { 
      channelId,
      messageId: messageInfo.messageId,
      chatId: messageInfo.chatId,
      title: title || "not provided"
    });

    // TODO: Опционально сохранить в БД лог отправки (channelId, time, promptPreview)
    return {
      ...messageInfo,
      title,
      prompt
    };
  } catch (error) {
    Logger.error("Failed to generate and send prompt", {
      channelId,
      userId,
      error
    });
    throw error;
  }
}

