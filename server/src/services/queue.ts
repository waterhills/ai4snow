import Redis from 'ioredis';
import { config } from '../config';

const QUEUE_KEY = 'ski:tasks';

export interface TaskMessage {
  taskId: string;
  inputFileKey: string;
  inputFileUrl: string;
  callbackUrl: string;
  createdAt: string;
}

let redis: Redis | null = null;
let connectionFailed = false;

/**
 * 懒连接 Redis，失败重试 5 次后放弃并回退到开发模式
 */
function getRedis(): Redis | null {
  if (!config.redisUrl) return null;
  if (connectionFailed) return null;
  if (redis) return redis;

  redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) {
        console.error('Redis 连接重试次数过多，回退到 HTTP 轮询模式');
        connectionFailed = true;
        return null;
      }
      return Math.min(times * 500, 3000);
    },
    lazyConnect: true,
  });

  redis.on('error', (err) => {
    console.error('Redis 连接错误:', err.message);
  });

  redis.on('connect', () => {
    console.log('Redis 已连接');
    connectionFailed = false;
  });

  return redis;
}

/**
 * 发布任务到 Redis List
 * @returns true 表示已推送到 Redis，false 表示未推送（开发模式或失败）
 */
export async function publishTask(message: TaskMessage): Promise<boolean> {
  const client = getRedis();
  if (!client) {
    console.log(
      `[开发模式] 任务已创建: ${message.taskId} (无 Redis，Worker 将通过 HTTP 轮询获取)`
    );
    return false;
  }

  try {
    await client.lpush(QUEUE_KEY, JSON.stringify(message));
    console.log(`任务已推送到 Redis 队列 [${QUEUE_KEY}]: ${message.taskId}`);
    return true;
  } catch (err) {
    console.error('Redis LPUSH 失败，任务仅保存在数据库:', err);
    return false;
  }
}

/**
 * 获取队列中待处理任务数量（用于监控）
 */
export async function getQueueLength(): Promise<number> {
  const client = getRedis();
  if (!client) return -1; // 修改：未连接时返回 -1
  try {
    return await client.llen(QUEUE_KEY);
  } catch {
    return -1;
  }
}

/**
 * 优雅关闭 Redis 连接
 */
export function closeRedis(): void {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}
