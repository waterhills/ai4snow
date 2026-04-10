import { Queue } from 'bullmq';
import { config } from '../config';

let queue: Queue | null = null;

/**
 * 获取 BullMQ 队列实例
 * 如果没有配置 Redis，返回 null (开发模式)
 */
function getQueue(): Queue | null {
  if (!config.redisUrl) {
    return null;
  }
  if (!queue) {
    queue = new Queue('ski-inference', {
      connection: { url: config.redisUrl },
    });
  }
  return queue;
}

export interface TaskMessage {
  taskId: string;
  inputFileKey: string;
  inputFileUrl: string;
  callbackUrl: string;
  createdAt: string;
}

/**
 * 发布推理任务到消息队列
 * 开发模式(无Redis)下仅打印日志，任务保存在数据库中等待手动处理
 */
export async function publishTask(message: TaskMessage): Promise<void> {
  const q = getQueue();
  if (q) {
    await q.add('inference', message, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
    console.log(`📤 任务已发布到队列: ${message.taskId}`);
  } else {
    console.log(`📋 [开发模式] 任务已创建: ${message.taskId} (无 Redis，需手动处理或等待 Worker 连接)`);
  }
}
