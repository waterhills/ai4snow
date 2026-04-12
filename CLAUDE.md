# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SkiVision — a skiing pressure analysis SaaS platform (滑雪压力识别 SaaS 平台). Users upload ski-related media, tasks are processed via YOLO/RTMPose inference on a remote Mac Mini worker, and results are returned through callback APIs.

## Development Commands

```bash
# First-time setup: install dependencies in each sub-project
cd server && npm install
cd client && npm install
cd admin  && npm install

# Start all services (run in separate terminals)
npm run dev:server    # Express + tsx watch on port 3000
npm run dev:client    # Vite on port 5173
npm run dev:admin     # Vite on port 5174 (Ant Design dashboard)

# Database (Prisma + SQLite)
npm run db:push       # Push schema changes to DB
npm run db:seed       # Seed development data
npm run db:studio     # Open Prisma Studio GUI

# Build
cd server && npm run build    # tsc → dist/
cd client && npm run build    # tsc -b && vite build
cd admin  && npm run build    # tsc -b && vite build

# Worker (Python, runs on remote Mac Mini)
cd worker/ai4snow && pip install -r requirements.txt
cd worker/ai4snow && python worker.py   # Polls server for tasks
```

No test framework is currently configured. No linter/formatter is configured.

## Environment Variables

Server reads from `server/.env` (not checked into git):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | `dev-secret` | JWT signing key |
| `JWT_EXPIRES_IN` | `7d` | Token expiry |
| `REDIS_URL` | _(empty)_ | BullMQ queue; empty = dev mode (no queue dispatch) |
| `INTERNAL_API_KEY` | `dev-internal-key` | Worker callback authentication |
| `UPLOAD_DIR` | `./uploads` | File storage root (relative to server/) |
| `DATABASE_URL` | — | SQLite path (required, e.g. `file:./dev.db`) |

## Architecture

This is a **3-app monorepo + Python worker** without a workspace manager (root `package.json` scripts use `cd`).

### `server/` — Express API (port 3000)
- **Entry**: `server/src/index.ts` → `server/src/app.ts`
- **Config**: `server/src/config/index.ts` reads from `server/.env`
- **Database**: Prisma ORM + SQLite (`server/prisma/schema.prisma`)
- **DB client singleton**: `server/src/lib/db.ts`
- **Auth**: JWT Bearer tokens; `authMiddleware` (`middleware/auth.ts`) sets `req.userId`/`req.userRole` on `AuthRequest`; `adminMiddleware` (`middleware/admin.ts`) checks `req.userRole === 'ADMIN'`
- **Validation**: Zod schemas used inline in route handlers
- **Queue**: BullMQ + Redis (`services/queue.ts`); gracefully degrades — when `REDIS_URL` is empty, `publishTask()` logs only, worker polls DB instead

**API route mount points** (`server/src/app.ts`):
| Prefix | Routes | Purpose |
|--------|--------|---------|
| `/api/v1/auth` | `routes/auth.ts` | Register, login |
| `/api/v1/tasks` | `routes/task.ts` | Create/list/get tasks (client) |
| `/api/v1/user` | `routes/user.ts` | Profile, credits (client) |
| `/api/admin` | `routes/admin.ts` | Dashboard stats, user/task/payment management |
| `/api/internal` | `routes/callback.ts` | Worker pull/push callbacks (x-api-key auth) |

**Task lifecycle**:
1. User uploads file via `POST /api/v1/tasks` — Multer saves to `uploads/inputs/<uuid>.<ext>`, 1 credit deducted in a Prisma transaction, task created as `PENDING`
2. `publishTask()` dispatches to BullMQ (or logs in dev mode)
3. Worker calls `GET /api/internal/callback/pending-tasks` — server locks oldest PENDING task as PROCESSING via DB transaction
4. Worker runs YOLO/RTMPose pipeline (`run_ski_pipeline.py`), uploads result videos via `POST /api/internal/callback/upload-result`
5. Worker calls `POST /api/internal/callback/task-complete` with file keys and JSON metrics
6. On failure, `POST /api/internal/callback/task-failed` auto-refunds 1 credit via Prisma transaction

**File storage layout** (`UPLOAD_DIR`):
```
uploads/
├── inputs/<uuid>.ext        # User-uploaded originals
└── results/result_<uuid>.ext # Worker-generated result files
```
Files are served statically at `/uploads/inputs/...` and `/uploads/results/...`. Upload limit: 500MB. Accepted formats: `mp4, avi, mov, mkv, jpg, jpeg, png, webp`.

**DB models**: User (auth + credits), Task (status lifecycle: PENDING → PROCESSING → COMPLETED/FAILED), Payment (credits purchase records, methods: WECHAT/ALIPAY/MANUAL).

### `client/` — User-facing React SPA (port 5173)
- Vite + React 18 + TypeScript + Tailwind CSS
- **Routing**: React Router v7 (`src/App.tsx`), `PrivateRoute` guard checks Zustand `isLoggedIn`
- **State**: Zustand store at `src/stores/auth.ts` — `token`/`user` persisted to `localStorage` under keys `token` and `user`
- **API**: Axios at `src/services/api.ts`, proxies `/api` and `/uploads` to `localhost:3000`; 401 responses trigger redirect to `/login`
- **Pages**: Home, Login, Register, Upload, Pricing, Result (`/results/:id?`)
- **Design system**: "Alpine Glacial Lab" — custom dark color palette in `tailwind.config.mjs`, fonts: Space Grotesk (headlines) + Inter (body), Tailwind plugins: `@tailwindcss/forms`, `@tailwindcss/container-queries`

### `admin/` — Admin dashboard (port 5174)
- Vite + React 18 + TypeScript + **Ant Design** (not Tailwind)
- **Auth**: Separate keys in localStorage — `admin_token` and `admin_user` (not interchangeable with client's `token`/`user`)
- **API**: Axios at `src/services/api.ts` with separate `adminApi` namespace, proxies `/api` to `localhost:3000`; 401/403 responses clear admin session
- **Pages**: Login, Dashboard (stats), Users (credit management), Tasks (retry failed tasks)
- **Layout**: Ant Design `Layout` + `Sider` with dark theme in `App.tsx`

### `worker/ai4snow/` — Python inference worker
- **Entry**: `worker.py` — infinite poll loop calling `GET /api/internal/callback/pending-tasks` every 5 seconds
- **Pipeline**: `run_ski_pipeline.py` — orchestrates YOLOv8 detection → RTMPose keypoint tracking → pressure curve analysis
- **Evaluators**: `evaluators/` directory with `router.py`, `casi_evaluator.py`, `jsba_evaluator.py` for different skiing standards
- **Result artifacts**: `pressure_sync_video.mp4` (primary), `{name}_side_by_side.mp4` (secondary), `pressure_curve_metrics.json`
- **Video transcoding**: Worker re-encodes results to H.264 via FFmpeg (`recode_to_h264()`) for browser compatibility
- **Config**: `API_BASE_URL`, `INTERNAL_API_KEY`, `PIPELINE_ID`, `POLL_INTERVAL` are constants at the top of `worker.py`

## Key Patterns

- **Server/client have separate auth tokens**: Client uses `token`/`user` in localStorage, admin uses `admin_token`/`admin_user`. They are not interchangeable.
- **No Redis required for dev**: When `REDIS_URL` is empty in `.env`, the queue service logs tasks without dispatching. The worker can still poll via the `/api/internal/callback/pending-tasks` endpoint.
- **Internal API key**: Worker authenticates via `x-api-key` header matched against `INTERNAL_API_KEY` in `.env`.
- **Task result has dual videos**: `resultFileKey` (primary sync analysis video) and `resultFileKey2` (secondary side-by-side comparison). The client Result page displays both.
- **Credits system**: 1 credit per task, deducted on creation, auto-refunded on failure. Admin can manually adjust credits.

## Language

All UI text, comments, console logs, and API error messages are in Chinese. Code identifiers (variables, functions, types) use English.
