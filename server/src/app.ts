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
const isProduction = process.env.NODE_ENV === 'production';

// ===== 中间件 =====
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: isProduction ? false : {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "media-src": ["'self'", "*"],
      "img-src": ["'self'", "data:", "http://localhost:3000"],
    },
  },
}));
app.use(cors({
  origin: isProduction
    ? false  // 生产环境同源，不需要 CORS
    : ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}));
app.use(morgan(isProduction ? 'combined' : 'dev'));
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

// ===== 生产环境：托管前端静态文件 =====
if (isProduction) {
  const clientDist = path.join(__dirname, '../../client/dist');
  const adminDist = path.join(__dirname, '../../admin/dist');

  // 托管 admin 构建产物
  app.use('/admin', express.static(adminDist));

  // 托管 client 构建产物
  app.use(express.static(clientDist));

  // Admin SPA fallback (包括 /admin, /admin/, /admin/*)
  app.get(/^\/admin(\/.*)?$/, (_req, res) => {
    res.sendFile(path.join(adminDist, 'index.html'));
  });

  // Client SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

export default app;
