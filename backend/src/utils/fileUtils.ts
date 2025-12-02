/**
 * Утилиты для работы с именами файлов
 */

/**
 * Очищает название файла от недопустимых символов
 * @param title - Название ролика/файла
 * @returns Очищенное имя файла
 */
export function sanitizeFileName(title: string): string {
  if (!title || typeof title !== "string") {
    return "video";
  }

  return title
    .trim()
    // Удаляем недопустимые символы для файловых систем
    .replace(/[\\/:*?"<>|]/g, "_")
    // Заменяем пробелы и множественные подчёркивания на одно
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    // Удаляем подчёркивания в начале и конце
    .replace(/^_+|_+$/g, "")
    // Ограничиваем длину (120 символов для безопасности)
    .slice(0, 120)
    // Если после очистки строка пустая, используем дефолтное имя
    || "video";
}

/**
 * Формирует полное имя файла с расширением
 * @param title - Название ролика/файла
 * @param extension - Расширение файла (по умолчанию .mp4)
 * @returns Имя файла с расширением
 */
export function formatFileName(title: string, extension: string = ".mp4"): string {
  const sanitized = sanitizeFileName(title);
  
  // Убираем расширение, если оно уже есть
  const withoutExt = sanitized.replace(/\.(mp4|avi|mov|mkv|webm)$/i, "");
  
  // Добавляем расширение
  return `${withoutExt}${extension}`;
}





