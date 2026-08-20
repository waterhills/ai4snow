import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/db';
import { config } from '../config';
import { recordWorkerHeartbeat } from '../services/monitor';

const router = Router();

/**
 * 内部 API Key 验证
 * Worker 回调时通过 x-api-key 请求头传递密钥
 */
function verifyInternalKey(req: any, res: any, next: any): void {
  const key = req.headers['x-api-key'];
  if (key !== config.internalApiKey) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }
  next();
}

// Worker 状态监控（放在鉴权前，以便监控非法连接尝试）
router.use((req, _res, next) => {
  if (req.path === '/callback/pending-tasks') {
    const workerIp = req.ip || req.socket.remoteAddress || 'unknown';
    recordWorkerHeartbeat(workerIp, req.headers['user-agent'] as string);
  }
  next();
});

router.use(verifyInternalKey);

// 配置结果文件上传存储
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const resultsDir = path.join(path.resolve(config.uploadDir), 'results');
    cb(null, resultsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `result_${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// Worker 上传结果文件
router.post('/callback/upload-result', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    console.log(`📥 收到 Worker 上传的结果文件: ${req.file.filename}`);
    res.json({ fileKey: req.file.filename });
  } catch (err) {
    console.error('保存结果文件失败:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Worker 通知：主动拉取等待中的任务 (无 Redis 纯数据库轮询方案)
router.get('/callback/pending-tasks', async (req, res) => {
  try {
    // 寻找最初创建的一个任务，并将其锁定为 PROCESSING 状态
    const task = await prisma.$transaction(async (tx) => {
      const pendingTask = await tx.task.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' }
      });
      if (!pendingTask) return null;
      
      return tx.task.update({
        where: { id: pendingTask.id },
        data: { status: 'PROCESSING' }
      });
    });

    if (!task) {
      res.json({ task: null });
      return;
    }

    res.json({ task });
  } catch (err) {
    console.error('拉取任务失败:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Worker 通知：任务完成
router.post('/callback/task-complete', async (req, res) => {
  try {
    const { taskId, resultFileKey, resultFileKey2, resultJson } = req.body;

    if (!taskId) {
      res.status(400).json({ error: 'Missing taskId' });
      return;
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        resultFileKey: resultFileKey || null,
        resultFileKey2: resultFileKey2 || null,
        resultJson: resultJson ? JSON.stringify(resultJson) : null,
        completedAt: new Date(),
      },
    });

    console.log(`✅ 任务完成: ${taskId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('处理任务完成回调失败:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Worker 通知：任务失败（自动退还积分）
router.post('/callback/task-failed', async (req, res) => {
  try {
    const { taskId, errorMsg } = req.body;

    if (!taskId) {
      res.status(400).json({ error: 'Missing taskId' });
      return;
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // 事务：更新任务状态 + 退还积分
    await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'FAILED',
          errorMsg: errorMsg || 'Unknown error',
          completedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: task.userId },
        data: { credits: { increment: 1 } },
      }),
    ]);

    console.log(`❌ 任务失败(已退还积分): ${taskId} - ${errorMsg}`);
    res.json({ success: true });
  } catch (err) {
    console.error('处理任务失败回调失败:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
