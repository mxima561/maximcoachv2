# Technology Stack

**Analysis Date:** 2026-03-06

## Languages

**Primary:**
- TypeScript 5.8 - All application code across apps and packages
- SQL - Supabase migrations (22 migration files in `supabase/migrations/`)

**Secondary:**
- HTML/CSS - Web frontend via Next.js/Tailwind

## Runtime

**Environment:**
- Node.js (ES2022 target, ESNext modules)
- All backend apps use ESM (`"type": "module"` in package.json)

**Package Manager:**
- pnpm 10.29.2 (declared via `packageManager` field in root `package.json`)
- Lockfile: `pnpm-lock.yaml` present

## Monorepo Structure

**Workspace Tool:** pnpm workspaces + Turborepo v2

**Workspace Config:** `pnpm-workspace.yaml`
```
packages:
  - "apps/*"
  - "packages/*"
```

**Apps:**
| App | Package Name | Port | Purpose |
|-----|-------------|------|---------|
| `apps/api` | `@maxima/api` | 3001 | REST API server (Fastify) |
| `apps/voice` | `@maxima/voice` | 3002 | Real-time voice pipeline (WebSocket) |
| `apps/coach` | `@maxima/coach` | 3003 | AI coaching sessions (WebSocket) |
| `apps/web` | `@maxima/web` | 3000 | Frontend (Next.js) |
| `apps/extension` | `@maxima/extension` | N/A | Chrome extension |

**Packages:**
| Package | Purpose |
|---------|---------|
| `packages/shared` | Shared types, Zod schemas, utilities |
| `packages/auth` | JWT verification, token extraction |
| `packages/voice-core` | Voice pipeline core (STT/LLM/TTS abstractions) |

## Frameworks

**Core:**
- Next.js 16 - Web frontend (`apps/web/package.json`)
- Fastify 5.7.4 - API server (`apps/api/package.json`)
- ws 8.19.0 - WebSocket servers for voice + coach (`apps/voice`, `apps/coach`)

**AI/ML:**
- Vercel AI SDK (`ai` 6.0.86) - Unified AI interface
- `@ai-sdk/openai` 3.0.29 - OpenAI provider (GPT-4o)
- `@deepgram/sdk` 4.11.3 - Speech-to-text
- `elevenlabs` 1.59.0 / `@elevenlabs/client` 0.14.0 - Text-to-speech

**UI:**
- React 19 + React DOM 19
- Tailwind CSS 4.1.18 (with `@tailwindcss/postcss`)
- Radix UI 1.4.3 - Headless UI primitives
- shadcn/ui 3.8.4 - Component library (dev dependency for CLI)
- Framer Motion 12.35.0 - Animations
- Lucide React 0.564.0 - Icons
- Recharts 3.7.0 - Charts/data visualization
- Three.js 0.182.0 - 3D rendering
- class-variance-authority 0.7.1 + clsx 2.1.1 + tailwind-merge 3.4.0 - Style utilities
- Geist 1.7.0 - Font

**Forms/Validation:**
- Zod 4.3.6 - Schema validation (shared across all apps)
- React Hook Form 7.71.1 + `@hookform/resolvers` 5.2.2 - Form management

**Data Fetching:**
- TanStack React Query 5.90.21 - Client-side data fetching/caching
- TanStack React Table 8.21.3 - Table/grid component

**Testing:**
- Vitest 4.0.18 - Unit/integration test runner (root `vitest.config.ts`)
- `@vitest/coverage-v8` 4.0.18 - Code coverage
- Playwright 1.58.2 - E2E testing (root `playwright.config.ts`)

**Build/Dev:**
- Turborepo 2.x - Monorepo build orchestration (`turbo.json`)
- tsx 4.x - TypeScript execution for dev mode
- TypeScript 5.8 - Type checking
- esbuild 0.25.3 - Extension bundling (`apps/extension`)
- ESLint 9.39.1 + eslint-config-next 16.1.6 - Linting (web only)

**Observability:**
- Sentry (`@sentry/node` 10.38.0, `@sentry/nextjs` 10.38.0, `@sentry/profiling-node` 10.38.0) - Error tracking + performance
- Pino 10.3.1 + pino-pretty 13.1.3 - Structured logging (API server)
- PostHog (`posthog-js` 1.358.1) - Product analytics

**Queue/Background Jobs:**
- BullMQ 5.69.2 - Job queue processing
- ioredis 5.9.3 - Redis/Valkey client

**Payments:**
- Stripe 20.3.1 - Subscription billing

**Push Notifications:**
- web-push 3.6.7 - Web Push (VAPID)

**Auth:**
- `@supabase/supabase-js` 2.95.3 - Supabase auth client
- `@supabase/ssr` 0.8.0 - Supabase SSR helpers (web)
- jose 6.1.3 - JWT verification

**CRM:**
- googleapis 171.4.0 - Google Sheets import (web)

## Key Dependencies

**Critical (app won't function without):**
- `@supabase/supabase-js` 2.95.3 - All data persistence and auth
- `ai` + `@ai-sdk/openai` - Core AI functionality (persona generation, scoring, coaching)
- `fastify` 5.7.4 - API server framework
- `next` 16 - Web application framework
- `stripe` 20.3.1 - Billing and subscriptions
- `ws` 8.19.0 - Voice/coach real-time communication

**Infrastructure:**
- `bullmq` 5.69.2 - Async job processing (CRM sync, reports, gamification, audio compression)
- `ioredis` 5.9.3 - Queue backend (Valkey/Redis)
- `@sentry/node` + `@sentry/nextjs` 10.38.0 - Error monitoring

## Configuration

**TypeScript:**
- Base config: `tsconfig.base.json` (ES2022 target, ESNext modules, bundler resolution, strict mode)
- Each app has its own `tsconfig.json` extending base

**Build Orchestration:**
- `turbo.json` defines task pipeline: build (depends on ^build), dev, lint, typecheck, test
- Build outputs: `.next/**`, `dist/**`

**Environment:**
- dotenv used in backend apps (`import "dotenv/config"`)
- `NEXT_PUBLIC_*` prefix for browser-exposed env vars in Next.js
- `.env.example` exists at `apps/web/.env.example`
- `.env` files are gitignored

**Required Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (browser)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase admin key (server)
- `OPENAI_API_KEY` - OpenAI API access
- `DEEPGRAM_API_KEY` - Speech-to-text
- `ELEVENLABS_API_KEY` - Text-to-speech
- `STRIPE_SECRET_KEY` - Billing
- `STRIPE_WEBHOOK_SECRET` - Webhook verification
- `VALKEY_URL` / `REDIS_URL` - Queue backend
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` - Push notifications
- `SENTRY_DSN` - Error tracking

## Platform Requirements

**Development:**
- Node.js (ES2022 compatible, likely v20+)
- pnpm 10.29.2
- Docker + Docker Compose (optional, for local Valkey)

**Production:**
- DigitalOcean App Platform (API) - `do-app-spec.yaml`
- Vercel (Web) - Next.js standalone output mode
- Docker containers for API, Voice, Coach, Web services
- Valkey 8 (Redis-compatible) for job queues

**Deployment:**
- `docker-compose.yml` for full stack local deployment
- Individual Dockerfiles per app: `apps/api/Dockerfile`, `apps/voice/Dockerfile`, `apps/web/Dockerfile`
- DigitalOcean App Platform spec: `do-app-spec.yaml` (auto-deploy on push to main)

---

*Stack analysis: 2026-03-06*
