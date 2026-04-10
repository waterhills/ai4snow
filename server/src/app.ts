import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import authRoutes from './routes/auth';
import taskRoutes from './routes/task';
import userRoutes from './routes/user';
import adminRoutes from './routes/admin';
import callbackRoutes from './routes/callback';
import { config } from './config';
import { ensureUploadDir } from './services/storage';

// 确保上传目录存在
ensureUploadDir();

const app = express();

// ===== 中间件 =====
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'], // Vite 开发服务器
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件：上传的文件可通过 /uploads/xxx 访问
app.use('/uploads', express.static(path.resolve(config.uploadDir)));

// ===== 路由挂载 =====
app.use('/api/v1/auth', authRoutes);      // 认证
app.use('/api/v1/tasks', taskRoutes);     // 任务 (客户端)
app.use('/api/v1/user', userRoutes);      // 用户信息 (客户端)
app.use('/api/admin', adminRoutes);       // 管理后台
app.use('/api/internal', callbackRoutes); // Worker 回调 (内部)

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
