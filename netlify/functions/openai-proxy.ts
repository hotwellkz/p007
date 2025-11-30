import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

const handler: Handler = async (
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

    // Создаем AbortController для таймаута (25 секунд для Netlify Functions)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      // Делаем запрос к OpenAI API с таймаутом
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
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      // Обработка таймаута
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return {
          statusCode: 504,
          headers,
          body: JSON.stringify({
            error: "Превышено время ожидания ответа от OpenAI API. Попробуйте сократить запрос или использовать более быструю модель."
          })
        };
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error("Ошибка при проксировании запроса к OpenAI:", error);
    
    // Определяем тип ошибки для более понятного сообщения
    let errorMessage = "Неизвестная ошибка при обработке запроса";
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.name === "AbortError" || error.message.includes("timeout")) {
        errorMessage = "Превышено время ожидания ответа от OpenAI API";
        statusCode = 504;
      } else if (error.message.includes("fetch")) {
        errorMessage = "Не удалось подключиться к OpenAI API. Проверьте интернет-соединение.";
        statusCode = 503;
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      statusCode,
      headers,
      body: JSON.stringify({
        error: errorMessage
      })
    };
  }
};

export { handler };

