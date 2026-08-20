import si from 'systeminformation';
import os from 'os';
import { getQueueLength } from './queue';

// Worker 心跳记录：Worker 每次轮询任务时更新时间戳
// 键为 Worker 标识（IP 或自定义 ID），值为最后一次心跳时间
const workerHeartbeats = new Map<string, { lastSeen: Date; ip: string; userAgent?: string }>();

// 内存中保留最近的系统快照用于趋势展示（最多保留 60 条，约 5 分钟的数据）
const MAX_HISTORY = 60;
const metricsHistory: Array<{
  timestamp: string;
  cpuPercent: number;
  memPercent: number;
}> = [];

/**
 * 记录 Worker 心跳
 * 在 Worker 拉取任务时调用
 */
export function recordWorkerHeartbeat(ip: string, userAgent?: string): void {
  workerHeartbeats.set(ip, { lastSeen: new Date(), ip, userAgent });
}

/**
 * 获取当前在线的 Worker 列表
 * 超过 30 秒无心跳视为离线
 */
export function getOnlineWorkers(): Array<{ ip: string; lastSeen: string; userAgent?: string; online: boolean }> {
  const now = Date.now();
  const result: Array<{ ip: string; lastSeen: string; userAgent?: string; online: boolean }> = [];

  for (const [, info] of workerHeartbeats) {
    const elapsed = now - info.lastSeen.getTime();
    result.push({
      ip: info.ip,
      lastSeen: info.lastSeen.toISOString(),
      userAgent: info.userAgent,
      // 30 秒内有心跳视为在线
      online: elapsed < 30_000,
    });
  }

  return result;
}

/**
 * 采集当前系统资源快照
 * 返回 CPU、内存、磁盘、系统信息
 */
export async function getSystemStats() {
  const [cpuLoad, mem, disk, time, osInfo] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.time(),
    si.osInfo(),
  ]);

  const cpuPercent = Math.round(cpuLoad.currentLoad * 10) / 10;
  const memPercent = Math.round((mem.used / mem.total) * 1000) / 10;

  // 记录到历史数据
  metricsHistory.push({
    timestamp: new Date().toISOString(),
    cpuPercent,
    memPercent,
  });
  // 超出上限则丢弃最旧的
  if (metricsHistory.length > MAX_HISTORY) {
    metricsHistory.splice(0, metricsHistory.length - MAX_HISTORY);
  }

  // 获取 Redis 队列长度
  let queueLength = 0;
  try {
    queueLength = await getQueueLength();
  } catch {
    queueLength = -1;
  }

  return {
    cpu: {
      percent: cpuPercent,
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || 'Unknown',
    },
    memory: {
      total: mem.total,
      used: mem.used,
      free: mem.free,
      percent: memPercent,
    },
    disk: disk.map((d) => ({
      fs: d.fs,
      size: d.size,
      used: d.used,
      available: d.available,
      percent: d.use,
      mount: d.mount,
    })),
    system: {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      hostname: os.hostname(),
      uptime: time.uptime,
      nodeVersion: process.version,
    },
    queue: {
      pending: queueLength,
    },
    workers: getOnlineWorkers(),
    // 返回历史数据供前端绘制趋势图
    history: metricsHistory.slice(),
  };
}
