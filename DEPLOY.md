# SkiVision 部署说明

## 部署架构

```
用户浏览器
    |
    v
香港 VPS (103.251.89.147:80)
    |
    Express (端口 80) -- 托管 client/admin 静态文件 + API 路由
    |
    SQLite (server/prod.db) -- 用户/任务/支付数据
```

**关键决策：**
- Express 直接监听 80 端口，不走 Nginx 反代
- 原因：VPS 安全组只开放了 80、4066（SSH）、7000（frps）等少量端口，3000 端口被 frps 占用，非标准端口的外部连接被阻断
- Nginx 已安装但未启用（端口 80 被 Express 占用）

## VPS 信息

| 项目 | 值 |
|------|------|
| IP | `103.251.89.147` |
| SSH 端口 | `4066` |
| SSH 命令 | `ssh -p 4066 root@103.251.89.147` |
| 系统 | Debian 12 (bookworm) |
| 内存 | ~2GB |
| Node.js | v20.20.2 |
| PM2 | v6.0.14 |
| 项目目录 | `/opt/skivision` |

## 线上地址

| 页面 | URL |
|------|-----|
| 前端 | http://103.251.89.147 |
| 管理后台 | http://103.251.89.147/admin |
| API 健康检查 | http://103.251.89.147/api/health |

## 本机开发

**完全可以继续在本机开发测试。** 部署改动对开发模式没有影响（所有生产环境配置都在 `if (isProduction)` 块内）。

### 启动方式

```bash
# 终端 1: 启动后端
cd server && npm run dev:server    # Express 端口 3000

# 终端 2: 启动前端
cd client && npm run dev:client    # Vite 端口 5173 -> http://localhost:5173

# 终端 3: 启动管理后台
cd admin && npm run dev:admin      # Vite 端口 5174 -> http://localhost:5174/admin
```

**注意：** 管理后台统一使用 `/admin` 路径，本地开发也需要访问 `http://localhost:5174/admin/`（不是 `http://localhost:5174/`）。

## 代码改动清单

以下是部署过程中对源码做的修改：

| 文件 | 改动 | 原因 |
|------|------|------|
| `server/src/app.ts` | 添加 `isProduction` 判断，生产模式下托管 client/admin 静态文件 + SPA fallback；关闭 CSP（避免线上限制）；CORS 改为 `false`（同源不需要） | Express 需要在线上同时提供前端和 API |
| `admin/vite.config.ts` | 添加 `base: '/admin'` | Admin 构建产物部署在 `/admin` 子路径下 |
| `admin/src/main.tsx` | `BrowserRouter` 添加 `basename="/admin"` | Admin 路由需要基于 `/admin` 前缀 |
| `admin/src/App.tsx` | `Navigate to` 和 `navigate()` 从绝对路径改为相对路径 | 配合 basename，避免跳转到客户端的 `/login` |
| `admin/src/services/api.ts` | 401 跳转从 `/login` 改为 `/admin/login` | 确保未登录时跳转到 admin 登录页 |
| `server/src/routes/auth.ts` | jwt.sign 选项添加 `as jwt.SignOptions` 类型断言 | 修复 @types/jsonwebtoken 9.x 严格类型错误 |
| `server/src/routes/task.ts` | `req.params.id` 提取为 `taskId` 变量 | 修复 Express v5 params 类型问题 |
| `server/src/routes/admin.ts` | `req.params.id` 提取为 `taskId` 变量 | 同上 |
| `server/src/config/index.ts` | `jwtExpiresIn` 添加 `as string` 类型标注 | 修复类型推断 |

## Worker 本机测试配置

修改 `worker/ai4snow/worker.py` 顶部的常量：

```python
API_BASE_URL = "http://103.251.89.147"
INTERNAL_API_KEY = "ski-internal-prod-key-2026"  # 和 VPS .env 中一致
```

Worker 通过公网回调到 VPS 的 `/api/internal/...` 接口，不需要连接 VPS 的内部端口。

## 更新部署

当本地代码有改动时：

```bash
# 1. 构建前端和后端
cd client && npm run build
cd admin && npm run build
cd server && npm run build

# 2. 执行部署脚本（自动上传 + 重启）
python deploy.py
```

`deploy.py` 会：
1. 上传 `admin/dist` 和 `server/dist` 到 VPS
2. 通过 PM2 重启服务
3. 验证各页面 HTTP 状态码

**前提：** 需要安装 `paramiko` 和 `scp`（`pip install paramiko scp`）。

## VPS 常用命令

```bash
# SSH 登录
ssh -p 4066 root@103.251.89.147

# PM2 进程管理
pm2 status                    # 查看状态
pm2 logs skivision-server     # 查看日志
pm2 restart skivision-server  # 重启
pm2 stop skivision-server     # 停止

# 查看环境变量
cat /opt/skivision/server/.env

# 数据库操作
cd /opt/skivision/server
npx prisma studio              # 打开数据库 GUI
cp prod.db prod.db.bak         # 备份数据库

# 系统监控
free -m                        # 内存
df -h                          # 磁盘
ss -tulnp                      # 端口监听
```

## VPS .env 配置

```
PORT=80
NODE_ENV=production
JWT_SECRET="ski-prod-jwt-secret-2026-change-me"
JWT_EXPIRES_IN="7d"
REDIS_URL=""
INTERNAL_API_KEY="ski-internal-prod-key-2026"
UPLOAD_DIR="./uploads"
DATABASE_URL="file:./prod.db"
```

> **安全提示：** 生产环境的 JWT_SECRET 应改为强随机字符串。当前值仅用于初始部署。
