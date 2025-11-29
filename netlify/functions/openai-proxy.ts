import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  // Разрешаем CORS для всех источников
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  // Обработка preflight запросов
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: ""
    };
  }

  // Проверяем метод запроса
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  // Получаем API ключ из переменных окружения
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "OpenAI API ключ не настроен на сервере"
      })
    };
  }

  try {
    // Парсим тело запроса
    const requestBody = JSON.parse(event.body || "{}");

    // Проверяем наличие обязательных полей
    if (!requestBody.model || !requestBody.messages) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Отсутствуют обязательные поля: model или messages"
        })
      };
    }

    // Делаем запрос к OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    // Получаем ответ от OpenAI
    const data = await response.json().catch(() => ({
      error: {
        message: "Не удалось распарсить ответ от OpenAI API"
      }
    }));

    // Возвращаем ответ клиенту
    return {
      statusCode: response.status,
      headers,
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error("Ошибка при проксировании запроса к OpenAI:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Неизвестная ошибка при обработке запроса"
      })
    };
  }
};

