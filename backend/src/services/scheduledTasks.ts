import { Logger } from "../utils/logger";
import { downloadAndUploadVideoToDrive, type DownloadAndUploadOptions } from "./videoDownloadService";

interface ScheduledTask {
  id: string;
  channelId: string;
  scheduleId: string;
  userId: string;
  runAt: number; // timestamp в миллисекундах
  telegramMessageId?: number;
  timeoutId?: NodeJS.Timeout;
}

// Хранилище активных задач
const activeTasks = new Map<string, ScheduledTask>();

/**
 * Планирует автоматическое скачивание и загрузку видео в Google Drive
 * @param options - Параметры задачи
 * @returns ID задачи
 */
export function scheduleAutoDownload(options: {
  channelId: string;
  scheduleId: string;
  userId: string;
  telegramMessageInfo: { messageId: number; chatId: string };
  delayMinutes: number;
}): string {
  const { channelId, scheduleId, userId, telegramMessageInfo, delayMinutes } = options;
  
  const taskId = `${channelId}_${scheduleId}_${Date.now()}`;
  const delayMs = delayMinutes * 60 * 1000;
  const runAt = Date.now() + delayMs;

  Logger.info("scheduleAutoDownload: scheduling task", {
    taskId,
    channelId,
    scheduleId,
    userId,
    messageId: telegramMessageInfo.messageId,
    delayMinutes,
    runAt: new Date(runAt).toISOString()
  });

  // Отменяем предыдущую задачу для этого scheduleId, если она существует
  const existingTaskKey = `${channelId}_${scheduleId}`;
  const existingTask = Array.from(activeTasks.values()).find(
    (task) => task.channelId === channelId && task.scheduleId === scheduleId
  );
  
  if (existingTask && existingTask.timeoutId) {
    Logger.info("scheduleAutoDownload: cancelling existing task", {
      existingTaskId: existingTask.id,
      channelId,
      scheduleId
    });
    clearTimeout(existingTask.timeoutId);
    activeTasks.delete(existingTask.id);
  }

  // Создаём таймаут для выполнения задачи
  const timeoutId = setTimeout(async () => {
    Logger.info("scheduleAutoDownload: executing scheduled task", {
      taskId,
      channelId,
      scheduleId,
      userId,
      messageId: telegramMessageInfo.messageId
    });

    try {
      // Вызываем функцию скачивания и загрузки
      const result = await downloadAndUploadVideoToDrive({
        channelId,
        userId,
        telegramMessageId: telegramMessageInfo.messageId,
        scheduleId
      });

      if (result.success) {
        Logger.info("scheduleAutoDownload: task completed successfully", {
          taskId,
          channelId,
          scheduleId,
          driveFileId: result.driveFileId,
          fileName: result.fileName
        });
      } else {
        Logger.error("scheduleAutoDownload: task failed", {
          taskId,
          channelId,
          scheduleId,
          error: result.error
        });
      }
    } catch (error) {
      Logger.error("scheduleAutoDownload: task execution error", {
        taskId,
        channelId,
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
    } finally {
      // Удаляем задачу из активных
      activeTasks.delete(taskId);
    }
  }, delayMs);

  // Сохраняем задачу
  const task: ScheduledTask = {
    id: taskId,
    channelId,
    scheduleId,
    userId,
    runAt,
    telegramMessageId: telegramMessageInfo.messageId,
    timeoutId
  };

  activeTasks.set(taskId, task);

  Logger.info("scheduleAutoDownload: task scheduled", {
    taskId,
    channelId,
    scheduleId,
    willRunAt: new Date(runAt).toISOString(),
    activeTasksCount: activeTasks.size
  });

  return taskId;
}

/**
 * Отменяет запланированную задачу
 * @param taskId - ID задачи
 */
export function cancelScheduledTask(taskId: string): boolean {
  const task = activeTasks.get(taskId);
  if (!task) {
    return false;
  }

  if (task.timeoutId) {
    clearTimeout(task.timeoutId);
  }

  activeTasks.delete(taskId);

  Logger.info("cancelScheduledTask: task cancelled", {
    taskId,
    channelId: task.channelId,
    scheduleId: task.scheduleId
  });

  return true;
}

/**
 * Отменяет все задачи для указанного канала и расписания
 * @param channelId - ID канала
 * @param scheduleId - ID расписания
 */
export function cancelTasksForSchedule(channelId: string, scheduleId: string): number {
  let cancelledCount = 0;

  for (const [taskId, task] of activeTasks.entries()) {
    if (task.channelId === channelId && task.scheduleId === scheduleId) {
      if (task.timeoutId) {
        clearTimeout(task.timeoutId);
      }
      activeTasks.delete(taskId);
      cancelledCount++;
    }
  }

  if (cancelledCount > 0) {
    Logger.info("cancelTasksForSchedule: tasks cancelled", {
      channelId,
      scheduleId,
      cancelledCount
    });
  }

  return cancelledCount;
}

/**
 * Получает информацию о всех активных задачах
 */
export function getActiveTasks(): Array<{
  id: string;
  channelId: string;
  scheduleId: string;
  userId: string;
  runAt: string;
  telegramMessageId?: number;
}> {
  return Array.from(activeTasks.values()).map((task) => ({
    id: task.id,
    channelId: task.channelId,
    scheduleId: task.scheduleId,
    userId: task.userId,
    runAt: new Date(task.runAt).toISOString(),
    telegramMessageId: task.telegramMessageId
  }));
}

