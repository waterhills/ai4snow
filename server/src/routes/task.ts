import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/db';
import { publishTask } from '../services/queue';
import { config } from '../config';

const router = Router();

// 文件上传配置：按日期分目录存储
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.resolve(config.uploadDir));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(mp4|avi|mov|mkv|jpg|jpeg|png|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式，请上传视频(mp4/avi/mov/mkv)或图片(jpg/png/webp)'));
    }
  },
});

// 创建分析任务（上传文件）
router.post('/', authMiddleware, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '请上传文件' });
      return;
    }

    // 检查积分是否充足
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || user.credits < 1) {
      res.status(403).json({ error: '积分不足，请联系管理员充值' });
      return;
    }

    // 事务：创建任务 + 扣减积分
    const task = await prisma.$transaction(async (tx) => {
      const newTask = await tx.task.create({
        data: {
          userId: req.userId!,
          inputFileKey: req.file!.filename,
          status: 'PENDING',
        },
      });

      await tx.user.update({
        where: { id: req.userId },
        data: { credits: { decrement: 1 } },
      });

      return newTask;
    });

    // 发布到消息队列（异步，不影响响应）
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    publishTask({
      taskId: task.id,
      inputFileKey: task.inputFileKey,
      inputFileUrl: `${baseUrl}/uploads/${task.inputFileKey}`,
      callbackUrl: `${baseUrl}/api/internal/callback`,
      createdAt: task.createdAt.toISOString(),
    }).catch((err) => console.error('发布任务到队列失败:', err));

    res.json({
      task: {
        id: task.id,
        status: task.status,
        createdAt: task.createdAt,
      },
    });
  } catch (err) {
    console.error('创建任务失败:', err);
    res.status(500).json({ error: '创建任务失败，请稍后重试' });
  }
});

// 获取用户任务列表
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.task.count({ where: { userId: req.userId } }),
    ]);

    res.json({ tasks, total, page, limit });
  } catch (err) {
    console.error('获取任务列表失败:', err);
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

// 获取单个任务详情
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!task) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }

    res.json({ task });
  } catch (err) {
    console.error('获取任务详情失败:', err);
    res.status(500).json({ error: '获取任务详情失败' });
  }
});

// 轻量级状态轮询接口
router.get('/:id/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, userId: req.userId },
      select: { id: true, status: true },
    });

    if (!task) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }

    res.json(task);
  } catch (err) {
    res.status(500).json({ error: '查询状态失败' });
  }
});

export default router;
