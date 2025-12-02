import { createTelegramClientFromStringSession } from "../telegram/client";
import { loadSessionString } from "../telegram/sessionStore";

const SYNX_CHAT_ID = process.env.SYNX_CHAT_ID;

export class TelegramSessionExpiredError extends Error {}

export async function sendPromptFromUserToSyntx(
  // userId сохранён для совместимости сигнатуры, сейчас не используется
  _userId: string,
  prompt: string
): Promise<void> {
  if (!SYNX_CHAT_ID) {
    throw new Error("SYNX_CHAT_ID is not configured");
  }

  const stringSession = loadSessionString();
  if (!stringSession) {
    throw new Error("TELEGRAM_SESSION_NOT_INITIALIZED");
  }

  let client;
  try {
    client = await createTelegramClientFromStringSession(stringSession);
    await client.sendMessage(SYNX_CHAT_ID, { message: prompt });
  } catch (err: any) {
    const message = String(err?.message ?? err);
    if (
      message.includes("AUTH_KEY_UNREGISTERED") ||
      message.includes("SESSION_REVOKED") ||
      message.includes("USER_DEACTIVATED") ||
      message.includes("PASSWORD_HASH_INVALID")
    ) {
      throw new TelegramSessionExpiredError(
        "TELEGRAM_SESSION_EXPIRED_NEED_RELOGIN"
      );
    }
    throw err;
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
    }
  }
}


