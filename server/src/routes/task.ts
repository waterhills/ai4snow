import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/db';
import { publishTask } from '../services/queue';
import { deleteTaskFiles } from '../services/storage';
import { config } from '../config';

const router = Router();

// 文件上传配置：按日期分目录存储
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const inputsDir = path.join(path.resolve(config.uploadDir), 'inputs');
    cb(null, inputsDir);
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

    // 获取用户信息，用于扣费判断
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    // 事务：创建任务 + 智能扣费（VIP 优先 → 基础积分兜底）
    const task = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const isVip = user.vipExpireAt && user.vipExpireAt > now;

      // VIP 用户：检查是否需要刷新当月额度（懒加载）
      if (isVip && (!user.vipRefreshAt || now >= user.vipRefreshAt)) {
        const nextRefresh = new Date(now);
        nextRefresh.setMonth(nextRefresh.getMonth() + 1);
        nextRefresh.setDate(1);
        nextRefresh.setHours(0, 0, 0, 0);

        await tx.user.update({
          where: { id: user.id },
          data: { vipCredits: 20, vipRefreshAt: nextRefresh },
        });
        // 刷新后当前额度为 20
        user.vipCredits = 20;
      }

      // 扣费优先级：VIP 专属额度 > 基础积分
      if (isVip && user.vipCredits > 0) {
        await tx.user.update({
          where: { id: user.id },
          data: { vipCredits: { decrement: 1 } },
        });
      } else if (user.credits > 0) {
        await tx.user.update({
          where: { id: user.id },
          data: { credits: { decrement: 1 } },
        });
      } else {
        throw new Error('INSUFFICIENT_CREDITS');
      }

      return tx.task.create({
        data: {
          userId: req.userId!,
          inputFileKey: req.file!.filename,
          status: 'PENDING',
        },
      });
    });

    // 发布到消息队列（异步，不影响响应）
    // 成功推送到 Redis 后将任务标记为 PROCESSING，防止 HTTP 轮询重复拾取
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    publishTask({
      taskId: task.id,
      inputFileKey: task.inputFileKey,
      inputFileUrl: `${baseUrl}/uploads/inputs/${task.inputFileKey}`,
      callbackUrl: `${baseUrl}/api/internal/callback`,
      createdAt: task.createdAt.toISOString(),
    }).then(async (pushed) => {
      if (pushed) {
        await prisma.task.update({
          where: { id: task.id },
          data: { status: 'PROCESSING' },
        }).catch((err) => console.error('更新任务状态为 PROCESSING 失败:', err));
      }
    });

    res.json({
      task: {
        id: task.id,
        status: task.status,
        createdAt: task.createdAt,
      },
    });
  } catch (err: any) {
    if (err?.message === 'INSUFFICIENT_CREDITS') {
      res.status(403).json({ error: '积分不足，请购买积分或开通会员' });
      return;
    }
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
    const taskId = req.params.id as string;
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId: req.userId },
    });

    if (!task) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }

    // 构造完整的详情对象，包含绝对 URL 和解析后的 JSON
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const taskDetail = {
      ...task,
      inputFileUrl: `${baseUrl}/uploads/inputs/${task.inputFileKey}`,
      resultFileUrl: task.resultFileKey ? `${baseUrl}/uploads/results/${task.resultFileKey}` : null,
      resultFileUrl2: task.resultFileKey2 ? `${baseUrl}/uploads/results/${task.resultFileKey2}` : null,
      resultJson: task.resultJson ? JSON.parse(task.resultJson) : null,
    };

    res.json(taskDetail);
  } catch (err) {
    console.error('获取任务详情失败:', err);
    res.status(500).json({ error: '获取任务详情失败' });
  }
});

// 轻量级状态轮询接口
router.get('/:id/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id as string;
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId: req.userId },
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

// 删除任务
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id as string;
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId: req.userId },
    });

    if (!task) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }

    // 删除关联文件 + 数据库记录，未完成的任务退还积分
    await prisma.$transaction(async (tx) => {
      if (task.status !== 'COMPLETED') {
        await tx.user.update({
          where: { id: req.userId },
          data: { credits: { increment: 1 } },
        });
      }
      await tx.task.delete({ where: { id: task.id } });
    });

    deleteTaskFiles(task);

    res.json({ success: true });
  } catch (err) {
    console.error('删除任务失败:', err);
    res.status(500).json({ error: '删除任务失败' });
  }
});

export default router;
