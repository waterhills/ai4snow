# AI4Snow 滑雪压力识别 SaaS 平台

AI4Snow 是一个基于人工智能的滑雪视频分析平台，通过计算机视觉技术识别滑雪者的动作并生成压力曲线分析报告，旨在为滑雪爱好者及专业运动员提供科学的训练参考。

## 快速上手 (Quick Start)

为了方便协作开发与功能测试，请按照以下步骤在您的本地环境配置项目。

### 1. 前置要求 (Prerequisites)

在开始之前，请确保您的电脑已安装以下软件：
- **Node.js**: v18.0 或更高版本
- **Python**: 3.9 或更高版本
- **FFmpeg**: 用于视频处理（Worker 依赖）
- **Docker**: 用于运行 Redis（任务队列）

### 2. 安装与配置 (Setup)

#### 第一步：克隆项目与安装依赖
```bash
# 安装根目录及各子模块依赖
npm install
```

#### 第二步：初始化数据库 (SQLite)
项目使用 SQLite 作为开发数据库，无需额外安装数据库服务端。
```bash
cd server
# 基于 Schema 创建本地数据库文件 (dev.db)
npx prisma db push

# 初始化测试数据 (自动创建管理员与普通用户)
npm run db:seed
```

#### 第三步：启动 Redis（任务队列）
```bash
# 在项目根目录启动 Redis 容器
docker compose up -d redis

# 在 server/.env 中配置（默认已配置）
# REDIS_URL="redis://localhost:6379"

# 在 worker/ai4snow/.env 中取消注释
# REDIS_URL=redis://localhost:6379
```

> 如果不启动 Redis，系统会自动回退到 HTTP 轮询模式（每 5 秒轮询一次），功能正常但延迟略高。

#### 第四步：配置分析引擎 (Python Worker)
```bash
cd worker/ai4snow
# 创建并激活虚拟环境 (可选)
# python -m venv venv
# source venv/bin/activate (Linux/Mac) 或 venv\Scripts\activate (Windows)

# 安装 AI 引擎依赖（包含 redis、python-dotenv 等）
pip install -r requirements.txt

# 根据需要编辑 .env 文件配置环境变量
```

### 3. 启动项目 (Running)

为了进行完整流程测试，您需要同时启动以下三个服务：

1. **后端服务 (API)**：
   在根目录运行 `npm run dev:server` (默认端口 3000)
2. **前端界面**：
   在根目录运行 `npm run dev:client` (访问 http://localhost:5173)
3. **分析引擎 (Worker)**：
   在 `worker/ai4snow` 目录下运行 `python worker.py`

### 4. 任务分发架构

系统支持两种任务分发模式，通过 `REDIS_URL` 环境变量自动切换：

| 模式 | 条件 | 延迟 | 说明 |
|------|------|------|------|
| **Redis 即时推送** | `REDIS_URL` 已配置 | < 1 秒 | Server 通过 Redis List 推送任务，Worker 即时获取 |
| **HTTP 轮询** | `REDIS_URL` 为空 | 0~5 秒 | Worker 每 5 秒轮询 Server 获取待处理任务 |

结果上传（视频、分析数据）通过 HTTP 回调完成，与任务分发模式无关。

---

## 测试账号 (Testing Accounts)

您可以使用以下预设账号直接登录本地运行的项目：

| 角色 | 账号 | 密码 | 权限说明 |
| :--- | :--- | :--- | :--- |
| **管理员** | `admin@skate.com` | `admin123` | 进入后台管理、审核任务、管理点数 |
| **测试用户** | `test@skate.com` | `test123` | 上传视频、查看个人压力分析报告 |

---

## 项目结构 (Project Structure)

- `/client`: 基于 React + Vite 的用户前端控制台。
- `/server`: 基于 Node.js + Express + Prisma 的后端 API。
- `/admin`: 后端管理后台界面。
- `/worker`: 基于 Python + PyTorch 的视频分析与压力识别引擎。
- `/server/prisma`: 数据库建模与迁移文件。
- `/docker-compose.yml`: Redis 容器配置。

## 协作流程

1. **拉取代码**：每次开发前执行 `git pull`。
2. **提交代码**：完成功能后执行 `git add .` -> `git commit -m "描述"` -> `git push`。
3. **环境同步**：如果数据库模型发生变更，请记得执行 `npx prisma db push`。

如有任何问题，请随时在 GitHub Issues 中反馈或直接联系项目维护者！
