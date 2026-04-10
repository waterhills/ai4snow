import app from './app';
import { config } from './config';

const PORT = config.port;

app.listen(PORT, () => {
  console.log('');
  console.log('🎿 滑雪压力识别 SaaS 平台 — 后端服务');
  console.log('==========================================');
  console.log(`🚀 服务运行中: http://localhost:${PORT}`);
  console.log(`📋 健康检查:   http://localhost:${PORT}/api/health`);
  console.log(`📤 文件上传:   http://localhost:${PORT}/uploads/`);
  console.log('==========================================');
  console.log(`🔑 Redis:   ${config.redisUrl || '未配置 (开发模式)'}`);
  console.log('');
});
