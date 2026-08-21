import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { config } from '../config';
import { sendVerificationCode } from '../services/mail';

const router = Router();

// ============================================================
// 验证码内存缓存
// 结构：email -> { code, expireAt, lastSentAt }
// 生产环境建议迁移到 Redis
// ============================================================
const codeCache = new Map<string, { code: string; expireAt: number; lastSentAt: number }>();

// 定时清理过期条目，防止内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of codeCache) {
    if (now > entry.expireAt) {
      codeCache.delete(email);
    }
  }
}, 60_000);

// ============================================================
// Schema 校验
// ============================================================

const sendCodeSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
});

const registerSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少6位'),
  name: z.string().optional(),
  code: z.string().length(6, '验证码为6位数字'),
});

const loginSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(1, '请输入密码'),
});

// ============================================================
// 发送验证码
// ============================================================
router.post('/send-code', async (req, res) => {
  try {
    const { email } = sendCodeSchema.parse(req.body);

    // 防刷：同一邮箱 60 秒内只能发送一次
    const cached = codeCache.get(email);
    if (cached && Date.now() - cached.lastSentAt < 60_000) {
      const remaining = Math.ceil((60_000 - (Date.now() - cached.lastSentAt)) / 1000);
      res.status(429).json({ error: `请${remaining}秒后再试` });
      return;
    }

    // 检查邮箱是否已注册
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: '该邮箱已注册' });
      return;
    }

    // 生成 6 位随机数字验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 存入缓存，有效期 5 分钟
    codeCache.set(email, {
      code,
      expireAt: Date.now() + 5 * 60 * 1000,
      lastSentAt: Date.now(),
    });

    // 发送邮件
    await sendVerificationCode(email, code);

    console.log(`[Mail] 验证码已发送至 ${email}`);
    res.json({ message: '验证码已发送，请查收邮件' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error('发送验证码失败:', err);
    res.status(500).json({ error: '发送验证码失败，请稍后重试' });
  }
});

// ============================================================
// 注册（需要验证码）
// ============================================================
router.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);

    // 校验验证码
    const cached = codeCache.get(data.email);
    if (!cached) {
      res.status(400).json({ error: '请先获取验证码' });
      return;
    }
    if (Date.now() > cached.expireAt) {
      codeCache.delete(data.email);
      res.status(400).json({ error: '验证码已过期，请重新获取' });
      return;
    }
    if (cached.code !== data.code) {
      res.status(400).json({ error: '验证码错误' });
      return;
    }

    // 验证码通过后删除缓存
    codeCache.delete(data.email);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      res.status(400).json({ error: '该邮箱已注册' });
      return;
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        credits: 3, // 新用户赠送 3 次免费分析
      },
    });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        credits: user.credits,
        role: user.role,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error('注册失败:', err);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

// ============================================================
// 登录（不变）
// ============================================================
router.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      res.status(400).json({ error: '用户不存在' });
      return;
    }

    // 账号状态检查：封禁和注销的用户不允许登录
    if (user.status === 'BANNED') {
      res.status(403).json({ error: '该账号已被封禁，请联系管理员' });
      return;
    }
    if (user.status === 'CANCELLED') {
      res.status(403).json({ error: '该账号已注销' });
      return;
    }

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      res.status(400).json({ error: '密码错误' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        credits: user.credits,
        role: user.role,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error('登录失败:', err);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

export default router;
