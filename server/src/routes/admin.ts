import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import { prisma } from '../lib/db';
import { publishTask } from '../services/queue';
import { getSystemStats } from '../services/monitor';

const router = Router();

// 所有管理后台路由 = 登录认证 + 管理员角色
router.use(authMiddleware, adminMiddleware);

// ===== 数据概览 =====
router.get('/dashboard/stats', async (_req, res) => {
  try {
    const [totalUsers, totalTasks, completedTasks, pendingTasks, failedTasks] =
      await Promise.all([
        prisma.user.count({ where: { role: 'USER' } }),
        prisma.task.count(),
        prisma.task.count({ where: { status: 'COMPLETED' } }),
        prisma.task.count({ where: { status: 'PENDING' } }),
        prisma.task.count({ where: { status: 'FAILED' } }),
      ]);

    // 今日新增用户和任务
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todayUsers, todayTasks] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.task.count({ where: { createdAt: { gte: today } } }),
    ]);

    res.json({
      totalUsers,
      totalTasks,
      completedTasks,
      pendingTasks,
      failedTasks,
      todayUsers,
      todayTasks,
    });
  } catch (err) {
    console.error('获取统计数据失败:', err);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// ===== 用户管理 =====
router.get('/users', async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { email: { contains: search } },
            { name: { contains: search } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          credits: true,
          vipCredits: true,
          vipExpireAt: true,
          vipRefreshAt: true,
          createdAt: true,
          _count: { select: { tasks: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page, limit });
  } catch (err) {
    console.error('获取用户列表失败:', err);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 调整用户积分
router.patch('/users/:id/credits', async (req: AuthRequest, res) => {
  try {
    const { credits, remark } = req.body;
    if (typeof credits !== 'number') {
      res.status(400).json({ error: '积分值必须为数字' });
      return;
    }

    const userId = req.params.id as string;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    // 防止积分变为负数
    if (user.credits + credits < 0) {
      res.status(400).json({ error: '积分不能为负数' });
      return;
    }

    // 事务：更新积分 + 记录操作
    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: credits } },
        select: { id: true, email: true, name: true, credits: true },
      }),
      prisma.payment.create({
        data: {
          userId: user.id,
          amount: 0,
          creditsAdded: credits,
          method: 'MANUAL',
          status: 'COMPLETED',
          remark: remark || `管理员手动调整积分 ${credits > 0 ? '+' : ''}${credits}`,
        },
      }),
    ]);

    res.json({ user: updated });
  } catch (err) {
    console.error('调整积分失败:', err);
    res.status(500).json({ error: '调整积分失败' });
  }
});

// 编辑用户信息（姓名、VIP 到期时间、VIP 专属额度）
router.put('/users/:id', async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id as string;
    const { name, vipExpireAt, vipCredits } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (vipCredits !== undefined) updateData.vipCredits = vipCredits;

    if (vipExpireAt !== undefined) {
      updateData.vipExpireAt = vipExpireAt ? new Date(vipExpireAt) : null;
      // 首次开通 VIP 时，自动设置刷新时间并赠送当月额度
      if (vipExpireAt && !user.vipExpireAt) {
        const nextRefresh = new Date();
        nextRefresh.setMonth(nextRefresh.getMonth() + 1);
        nextRefresh.setDate(1);
        nextRefresh.setHours(0, 0, 0, 0);
        updateData.vipRefreshAt = nextRefresh;
        updateData.vipCredits = 20;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, email: true, name: true, vipExpireAt: true, vipCredits: true, vipRefreshAt: true, status: true },
    });

    res.json({ user: updated });
  } catch (err) {
    console.error('编辑用户失败:', err);
    res.status(500).json({ error: '编辑用户失败' });
  }
});

// 封禁/解封用户
router.patch('/users/:id/ban', async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id as string;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }
    if (user.role === 'ADMIN') {
      res.status(400).json({ error: '不能封禁管理员账号' });
      return;
    }
    if (user.status === 'CANCELLED') {
      res.status(400).json({ error: '该账号已注销，无法操作' });
      return;
    }

    const newStatus = user.status === 'BANNED' ? 'ACTIVE' : 'BANNED';
    await prisma.user.update({ where: { id: userId }, data: { status: newStatus } });

    res.json({ message: newStatus === 'BANNED' ? '已封禁' : '已解封', status: newStatus });
  } catch (err) {
    console.error('封禁操作失败:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 注销用户（软删除 + 隐私匿名化，不可逆）
router.patch('/users/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id as string;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }
    if (user.role === 'ADMIN') {
      res.status(400).json({ error: '不能注销管理员账号' });
      return;
    }
    if (user.status === 'CANCELLED') {
      res.status(400).json({ error: '该账号已经是注销状态' });
      return;
    }

    // 匿名化处理：替换邮箱为随机值（释放原邮箱供重新注册），清空密码和姓名
    const anonymizedEmail = `deleted_${user.id.slice(0, 8)}_${Date.now()}@skate.local`;
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'CANCELLED',
        email: anonymizedEmail,
        password: 'CANCELLED_ACCOUNT_NO_ACCESS',
        name: null,
        phone: null,
        credits: 0,
        vipCredits: 0,
        vipExpireAt: null,
        vipRefreshAt: null,
      },
    });

    res.json({ message: '账号已注销，用户数据已匿名化处理' });
  } catch (err) {
    console.error('注销用户失败:', err);
    res.status(500).json({ error: '注销失败' });
  }
});

// ===== 任务管理 =====
router.get('/tasks', async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const skip = (page - 1) * limit;

    const where = status ? { status: status as any } : {};

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.task.count({ where }),
    ]);

    res.json({ tasks, total, page, limit });
  } catch (err) {
    console.error('获取任务列表失败:', err);
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

// 重试失败任务
router.post('/tasks/:id/retry', async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id as string;
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }
    if (task.status !== 'FAILED') {
      res.status(400).json({ error: '只能重试失败状态的任务' });
      return;
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { status: 'PENDING', errorMsg: null, completedAt: null },
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await publishTask({
      taskId: task.id,
      inputFileKey: task.inputFileKey,
      inputFileUrl: `${baseUrl}/uploads/${task.inputFileKey}`,
      callbackUrl: `${baseUrl}/api/internal/callback`,
      createdAt: new Date().toISOString(),
    });

    res.json({ message: '任务已重新提交' });
  } catch (err) {
    console.error('重试任务失败:', err);
    res.status(500).json({ error: '重试任务失败' });
  }
});

// ===== 支付/充值记录 =====
router.get('/payments', async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.payment.count(),
    ]);

    res.json({ payments, total, page, limit });
  } catch (err) {
    console.error('获取充值记录失败:', err);
    res.status(500).json({ error: '获取充值记录失败' });
  }
});

// 手动为用户充值
router.post('/payments/manual', async (req: AuthRequest, res) => {
  try {
    const { userId, credits, remark } = req.body;
    if (!userId || typeof credits !== 'number' || credits <= 0) {
      res.status(400).json({ error: '参数错误：需要 userId 和正整数 credits' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    const [payment] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          userId,
          amount: 0,
          creditsAdded: credits,
          method: 'MANUAL',
          status: 'COMPLETED',
          remark: remark || `管理员手动充值 ${credits} 积分`,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: credits } },
      }),
    ]);

    res.json({ payment });
  } catch (err) {
    console.error('手动充值失败:', err);
    res.status(500).json({ error: '手动充值失败' });
  }
});

// ===== 系统监控 =====
router.get('/system/stats', async (_req, res) => {
  try {
    const stats = await getSystemStats();
    res.json(stats);
  } catch (err) {
    console.error('获取系统状态失败:', err);
    res.status(500).json({ error: '获取系统状态失败' });
  }
});

// 最近 7 天的任务趋势数据（按天聚合）
router.get('/dashboard/trends', async (_req, res) => {
  try {
    const days = 7;
    const trends: Array<{ date: string; completed: number; failed: number; total: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const start = new Date();
      start.setDate(start.getDate() - i);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const [completed, failed, total] = await Promise.all([
        prisma.task.count({ where: { status: 'COMPLETED', createdAt: { gte: start, lt: end } } }),
        prisma.task.count({ where: { status: 'FAILED', createdAt: { gte: start, lt: end } } }),
        prisma.task.count({ where: { createdAt: { gte: start, lt: end } } }),
      ]);

      trends.push({
        date: start.toISOString().slice(0, 10),
        completed,
        failed,
        total,
      });
    }

    res.json({ trends });
  } catch (err) {
    console.error('获取趋势数据失败:', err);
    res.status(500).json({ error: '获取趋势数据失败' });
  }
});

export default router;
