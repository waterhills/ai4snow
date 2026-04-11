# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SkiVision — a skiing pressure analysis SaaS platform (滑雪压力识别 SaaS 平台). Users upload ski-related media, tasks are processed via YOLO inference on a remote Mac Mini worker, and results are returned through callback APIs.

## Development Commands

```bash
# Start all services (run in separate terminals)
npm run dev:server    # Express + tsx watch on port 3000
npm run dev:client    # Vite on port 5173
npm run dev:admin     # Vite on port 5174 (Ant Design dashboard)

# Database (Prisma + SQLite)
npm run db:push       # Push schema changes to DB
npm run db:seed       # Seed development data
npm run db:studio     # Open Prisma Studio GUI

# Build
cd client && npm run build    # tsc -b && vite build
cd admin && npm run build     # tsc -b && vite build
cd server && npm run build    # tsc only
```

No test framework is currently configured.

## Architecture

This is a **3-app monorepo** without a workspace manager (npm scripts use `cd`):

### `server/` — Express API (port 3000)
- **Entry**: `server/src/index.ts` → `server/src/app.ts`
- **Config**: `server/src/config/index.ts` reads from `server/.env`
- **Database**: Prisma ORM + SQLite (`prisma/schema.prisma`)
- **DB client singleton**: `server/src/lib/db.ts`
- **Auth**: JWT Bearer tokens, middleware at `server/src/middleware/auth.ts` and `admin.ts`
- **Validation**: Zod schemas used in route handlers
- **Queue**: BullMQ + Redis for task dispatch; gracefully degrades to DB-polling when Redis is unconfigured

**API route mount points** (`server/src/app.ts`):
| Prefix | Routes | Purpose |
|--------|--------|---------|
| `/api/v1/auth` | `routes/auth.ts` | Register, login |
| `/api/v1/tasks` | `routes/task.ts` | Create/list/get tasks (client) |
| `/api/v1/user` | `routes/user.ts` | Profile, credits (client) |
| `/api/admin` | `routes/admin.ts` | Dashboard stats, user/task management |
| `/api/internal` | `routes/callback.ts` | Worker pull/push callbacks |

**Worker callback flow** (`routes/callback.ts`):
1. Worker calls `GET /api/internal/callback/pending-tasks` → server locks oldest PENDING task as PROCESSING
2. Worker runs YOLO inference, then calls `POST /api/internal/callback/task-complete` or `task-failed`
3. Failed tasks auto-refund user credits via Prisma transaction

### `client/` — User-facing React SPA (port 5173)
- Vite + React 18 + TypeScript + Tailwind CSS
- **Routing**: React Router v7 (`src/App.tsx`), with `PrivateRoute` guard
- **State**: Zustand store at `src/stores/auth.ts` (token/user persisted to localStorage)
- **API**: Axios at `src/services/api.ts`, proxies `/api` and `/uploads` to `localhost:3000`
- **Pages**: Home, Login, Register, Upload, Pricing, Result
- **Design system**: "Alpine Glacial Lab" — custom Tailwind color palette in `tailwind.config.mjs`, fonts: Space Grotesk (headlines) + Inter (body)

### `admin/` — Admin dashboard (port 5174)
- Vite + React 18 + TypeScript + **Ant Design** (not Tailwind)
- **Auth**: Separate `admin_token` / `admin_user` in localStorage (distinct from client)
- **Pages**: Login, Dashboard (stats), Users, Tasks
- **API**: Axios at `src/services/api.ts`, proxies `/api` to `localhost:3000`

## Key Patterns

- **Server/client have separate auth tokens**: Client uses `token` in localStorage, admin uses `admin_token`. They are not interchangeable.
- **No Redis required for dev**: When `REDIS_URL` is empty in `.env`, the queue service logs tasks without dispatching. The worker can still poll via the `/api/internal/callback/pending-tasks` endpoint.
- **Internal API key**: Worker authenticates via `x-api-key` header matched against `INTERNAL_API_KEY` in `.env`.
- **File uploads**: Multer handles uploads, stored in `UPLOAD_DIR` (default `./uploads`), served statically at `/uploads/`.
- **DB models**: User (auth + credits), Task (status lifecycle: PENDING → PROCESSING → COMPLETED/FAILED), Payment (credits purchase records).

## Language

All UI text, comments, console logs, and API error messages are in Chinese. Code identifiers (variables, functions, types) use English.
