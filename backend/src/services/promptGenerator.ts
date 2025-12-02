import { db, isFirestoreAvailable } from "./firebaseAdmin";
import { Logger } from "../utils/logger";

// Типы для канала (упрощённая версия из frontend)
interface Channel {
  id: string;
  name: string;
  platform: "YOUTUBE_SHORTS" | "TIKTOK" | "INSTAGRAM_REELS" | "VK_CLIPS";
  language: "ru" | "en" | "kk";
  targetDurationSec: number;
  niche: string;
  audience: string;
  tone: string;
  blockedTopics: string;
  extraNotes?: string;
  generationMode?: "script" | "prompt" | "video-prompt-only";
}

const PLATFORM_NAMES: Record<Channel["platform"], string> = {
  YOUTUBE_SHORTS: "YouTube Shorts",
  TIKTOK: "TikTok",
  INSTAGRAM_REELS: "Instagram Reels",
  VK_CLIPS: "VK Клипы"
};

const LANGUAGE_NAMES: Record<Channel["language"], string> = {
  ru: "Русский",
  en: "English",
  kk: "Қазақша"
};

/**
 * Получает канал из Firestore
 */
async function getChannelFromFirestore(
  userId: string,
  channelId: string
): Promise<Channel | null> {
  if (!isFirestoreAvailable() || !db) {
    throw new Error("Firestore is not available");
  }

  const channelRef = db
    .collection("users")
    .doc(userId)
    .collection("channels")
    .doc(channelId);

  const channelSnap = await channelRef.get();

  if (!channelSnap.exists) {
    return null;
  }

  const data = channelSnap.data() as any;
  return {
    id: channelSnap.id,
    ...data
  } as Channel;
}

/**
 * Строит промпт для автогенерации идеи и сценариев
 */
function buildAutoGeneratePrompt(channel: Channel): string {
  const platformName = PLATFORM_NAMES[channel.platform];
  const languageName = LANGUAGE_NAMES[channel.language];

  return `Ты — сценарист коротких вертикальных видео (${platformName}).

На основе настроек канала:
- Платформа: ${platformName}
- Длительность: ${channel.targetDurationSec} секунд
- Язык: ${languageName}
- Ниша: ${channel.niche}
- Целевая аудитория: ${channel.audience}
- Тон/Стиль: ${channel.tone}
${channel.blockedTopics ? `- Запрещённые темы: ${channel.blockedTopics}` : ""}
${channel.extraNotes ? `- Дополнительные пожелания: ${channel.extraNotes}` : ""}

**Задача:**

1. Сначала придумай одну яркую, понятную и простую идею ролика, которая:
   - Подходит для ${platformName}
   - Укладывается в ${channel.targetDurationSec} секунд
   - Соответствует нише "${channel.niche}"
   - Интересует аудиторию: ${channel.audience}
   - Использует тон "${channel.tone}"
   ${channel.blockedTopics ? `- Избегает тем: ${channel.blockedTopics}` : ""}

2. Затем сразу напиши 1-3 готовых сценария для этого ролика.

Каждый сценарий должен быть:
- Коротким и покадровым
- С репликами и действиями
- Адаптированным под ${channel.targetDurationSec} секунд
- На ${languageName} языке

**Формат ответа (JSON):**

{
  "idea": "Краткое описание идеи ролика (1-2 предложения)",
  "scripts": [
    "Сценарий 1: [детальное описание с репликами и действиями]",
    "Сценарий 2: [детальное описание с репликами и действиями]",
    "Сценарий 3: [детальное описание с репликами и действиями] (опционально)"
  ]
}

Верни ТОЛЬКО валидный JSON, без дополнительных комментариев.`;
}

/**
 * Парсит ответ от OpenAI для автогенерации
 */
function parseAutoGenerateResponse(responseText: string): {
  idea: string;
  scripts: string[];
} {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        idea: parsed.idea || "",
        scripts: Array.isArray(parsed.scripts) ? parsed.scripts : []
      };
    }
    throw new Error("JSON не найден в ответе");
  } catch (error) {
    Logger.error("Ошибка парсинга JSON:", error);
    // Fallback: пытаемся извлечь идею и сценарии из текста
    const ideaMatch = responseText.match(/иде[яи][:]\s*(.+?)(?:\n|$)/i);
    const scripts: string[] = [];
    
    const lines = responseText.split("\n").filter((line) => line.trim());
    let currentScript = "";
    let inScript = false;
    
    for (const line of lines) {
      if (line.match(/сценарий\s*\d+[:]/i)) {
        if (currentScript) {
          scripts.push(currentScript.trim());
        }
        currentScript = line + "\n";
        inScript = true;
      } else if (inScript) {
        currentScript += line + "\n";
      }
    }
    
    if (currentScript) {
      scripts.push(currentScript.trim());
    }
    
    return {
      idea: ideaMatch ? ideaMatch[1].trim() : "Идея не найдена",
      scripts: scripts.length > 0 ? scripts : [responseText]
    };
  }
}

/**
 * Генерирует промпт для канала через OpenAI API
 */
async function callOpenAIProxy(
  requestBody: Record<string, unknown>
): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OpenAI API ключ не настроен на сервере");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response
      .json()
      .catch(() => ({ error: { message: "Не удалось распарсить ответ от OpenAI API" } }));

    if (!response.ok) {
      throw new Error(data.error?.message || `OpenAI API ошибка: ${response.status}`);
    }

    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Превышено время ожидания ответа от OpenAI API");
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Неизвестная ошибка при обработке запроса");
  }
}

/**
 * Генерирует промпт для канала (использует ту же логику, что и кнопка "ИИ-идея")
 * @param channelId - ID канала
 * @param userId - ID владельца канала
 * @returns Объект с промптом (videoPrompt для режима video-prompt-only, иначе первый сценарий)
 */
export async function generatePromptForChannel(
  channelId: string,
  userId: string
): Promise<{ prompt: string; title?: string }> {
  Logger.info("Generating prompt for channel", { channelId, userId });

  // Получаем канал из Firestore
  const channel = await getChannelFromFirestore(userId, channelId);
  if (!channel) {
    throw new Error(`Канал с ID ${channelId} не найден`);
  }

  const mode = channel.generationMode || "script";

  // Для режима "video-prompt-only" нужна более сложная логика с двумя запросами
  // Пока используем упрощённый подход: генерируем идею и сценарии, затем извлекаем промпт
  if (mode === "video-prompt-only") {
    // TODO: Реализовать полную логику для video-prompt-only (нужно два запроса к OpenAI)
    // Пока используем упрощённый вариант
    Logger.warn("video-prompt-only mode not fully implemented, using simplified approach");
  }

  // Строим промпт для автогенерации
  const systemPrompt = buildAutoGeneratePrompt(channel);
  const userPrompt = "Придумай идею и создай сценарии для этого канала.";

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const supportsJsonMode = model.includes("gpt-4") || model.includes("o3");

  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    temperature: 0.9,
    max_tokens: 2000
  };

  if (supportsJsonMode) {
    requestBody.response_format = { type: "json_object" };
  }

  try {
    const data = await callOpenAIProxy(requestBody);
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Пустой ответ от OpenAI API");
    }

    const result = parseAutoGenerateResponse(content);

    // Извлекаем промпт для отправки в Syntx
    // Для режима "video-prompt-only" нужно было бы сгенерировать videoPrompt,
    // но пока используем первый сценарий
    let prompt: string;
    if (mode === "video-prompt-only") {
      // В будущем здесь будет videoPrompt
      prompt = result.scripts[0] || result.idea;
    } else {
      // Для обычных режимов отправляем первый сценарий
      prompt = result.scripts[0] || result.idea;
    }

    if (!prompt || prompt.trim().length === 0) {
      throw new Error("Не удалось сгенерировать промпт");
    }

    Logger.info("Prompt generated successfully", {
      channelId,
      promptLength: prompt.length,
      mode
    });

    return {
      prompt: prompt.trim(),
      title: result.idea || undefined
    };
  } catch (error) {
    Logger.error("Failed to generate prompt", { channelId, error });
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Неизвестная ошибка при генерации промпта");
  }
}

