import { Router } from 'express';
import { prisma } from '../lib/db';
import { config } from '../config';

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

router.use(verifyInternalKey);

// Worker 通知：任务完成
router.post('/callback/task-complete', async (req, res) => {
  try {
    const { taskId, resultFileKey, resultJson } = req.body;

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
