# Architecture

**Analysis Date:** 2026-03-06

## Pattern Overview

**Overall:** Turborepo monorepo with multiple deployable services (API, Voice, Coach, Web) sharing packages, communicating via REST and WebSocket protocols, backed by Supabase (Postgres + Auth) with BullMQ for async job processing.

**Key Characteristics:**
- Multi-service architecture: 4 independent deployable apps + 1 Chrome extension
- Shared packages for auth, domain schemas, and voice-core logic
- Supabase as single data layer (Postgres, Auth, Storage) accessed via service-role clients
- Real-time voice pipeline using WebSocket servers (Voice and Coach services)
- Background job processing via BullMQ (Valkey/Redis) for CRM sync, reports, gamification, audio compression
- AI-powered features using OpenAI GPT-4o via Vercel AI SDK

## Layers

**Web Frontend (Next.js):**
- Purpose: User-facing SPA for sales reps, managers, and admins
- Location: `apps/web/`
- Contains: Pages (App Router), React components, Supabase client utilities, hooks
- Depends on: `@maxima/shared`, Supabase (direct client queries), API service (via fetch)
- Used by: End users (browser)

**API Service (Fastify):**
- Purpose: REST API for business logic, AI operations, billing, CRM integrations
- Location: `apps/api/`
- Contains: Route handlers, auth middleware, queue workers, Supabase service client
- Depends on: `@maxima/auth`, `@maxima/shared`, Supabase, OpenAI, Stripe, BullMQ
- Used by: Web frontend, external webhooks (Stripe)

**Voice Service (WebSocket):**
- Purpose: Real-time voice simulation pipeline (STT -> LLM -> TTS)
- Location: `apps/voice/`
- Contains: WebSocket server, VoicePipeline orchestrator, STT/TTS/LLM modules
- Depends on: `@maxima/auth`, `@maxima/shared`, `@maxima/voice-core`, Deepgram, ElevenLabs, OpenAI
- Used by: Web frontend (WebSocket connection)

**Coach Service (WebSocket):**
- Purpose: Live call coaching with real-time analysis
- Location: `apps/coach/`
- Contains: WebSocket server, CoachingSession manager, Supabase persistence
- Depends on: `@maxima/auth`, `@maxima/shared`, `@maxima/voice-core`, Deepgram, OpenAI
- Used by: Chrome extension (WebSocket connection)

**Chrome Extension:**
- Purpose: Capture tab audio during live sales calls for real-time coaching
- Location: `apps/extension/`
- Contains: Background script, popup UI, content script, tab audio capture
- Depends on: Coach service (WebSocket)
- Used by: Sales reps during live calls

**Shared Package:**
- Purpose: Domain types, Zod schemas, constants, feature gate logic
- Location: `packages/shared/`
- Contains: Zod schemas for all entities, plan/role/scenario constants, `canAccess()` feature gates
- Used by: All apps

**Auth Package:**
- Purpose: JWT verification and token extraction (supports Supabase client, JWT secret, and JWKS modes)
- Location: `packages/auth/`
- Contains: `verifyToken()`, `extractToken()`, `AuthError` class
- Used by: API, Voice, Coach services

**Voice-Core Package:**
- Purpose: Shared voice pipeline primitives (STT, LLM, state machine, cost tracking)
- Location: `packages/voice-core/`
- Contains: `DeepgramSTT`, `generateLLMResponse`, `VoiceStateMachine`, `CostTracker`
- Used by: Voice service, Coach service

## Data Flow

**Simulation Session (primary user flow):**

1. User navigates to `/simulations/new` in web app, selects scenario
2. Web app calls `POST /api/sessions/create` on API service (with Bearer token)
3. API validates auth, checks org membership + plan limits, creates session row in Supabase
4. Web app opens WebSocket to Voice service at `ws://voice:3002?token=...&session_id=...`
5. Voice service verifies JWT via `@maxima/auth`, creates `VoiceSession` + `VoicePipeline`
6. User speaks -> browser sends binary PCM audio -> Voice service forwards to Deepgram STT
7. Deepgram returns transcript -> LLM generates persona response -> ElevenLabs TTS streams audio back
8. On session end, web app calls `POST /api/scorecards/generate` -> API uses GPT-4o to score transcript
9. Scorecard saved to Supabase, ELO rating updated

**Live Coaching (extension flow):**

1. Extension background script opens WebSocket to Coach service at `ws://coach:3003?token=...`
2. Extension captures tab audio via `chrome.tabCapture`, converts to PCM, sends as binary
3. Coach service runs real-time STT + analysis, sends coaching suggestions back via WebSocket
4. On session end, coaching insights are saved to `coaching_insights` table in Supabase

**Background Job Processing:**

1. API routes enqueue jobs to BullMQ queues (crm-sync, reports, email, gamification, audio)
2. Workers in `apps/api/src/lib/queues.ts` process jobs asynchronously
3. Scheduled jobs: streak resets (hourly), daily training plans (5 AM UTC), leaderboard refresh (every 15 min), weekly reports (Monday 6 AM UTC)

**State Management:**
- Server: Supabase Postgres is the single source of truth for all persistent state
- Web client: React Query (`@tanstack/react-query`) for server state caching (staleTime: 60s)
- Web client: Direct Supabase client queries for dashboard data (bypassing API for reads)
- Voice/Coach: In-memory session state per WebSocket connection, managed by `VoiceStateMachine`

## Key Abstractions

**VoicePipeline:**
- Purpose: Orchestrates the full audio loop: mic -> STT -> LLM -> TTS -> speaker
- Examples: `apps/voice/src/pipeline.ts`
- Pattern: Event-driven pipeline with sequential TTS queuing and barge-in support

**VoiceStateMachine:**
- Purpose: Manages voice session states: IDLE -> LISTENING -> PROCESSING -> SPEAKING (+ INTERRUPTION)
- Examples: `packages/voice-core/src/state-machine.ts`
- Pattern: Finite state machine with transition validation

**CostTracker:**
- Purpose: Tracks per-session API costs (LLM tokens, STT seconds, TTS seconds) across providers
- Examples: `packages/voice-core/src/cost-tracker.ts`, `apps/voice/src/cost-tracker.ts`
- Pattern: Accumulator updated by pipeline components, summarized on session end

**requireAuth / requireOrgMembership:**
- Purpose: Request-level auth guards for API routes
- Examples: `apps/api/src/lib/auth.ts`
- Pattern: Early-return guard functions that send error responses and return null on failure

**Feature Gates:**
- Purpose: Plan-based feature access control
- Examples: `packages/shared/src/constants.ts` (`canAccess()`)
- Pattern: Declarative feature-to-plan mapping with runtime boolean check

**BullMQ Queues:**
- Purpose: Async job processing for CRM sync, reports, gamification, audio compression
- Examples: `apps/api/src/lib/queues.ts`
- Pattern: Lazy-initialized queues with named workers, exponential backoff retries (3 attempts)

## Entry Points

**Web App:**
- Location: `apps/web/src/app/layout.tsx` (root layout), `apps/web/src/app/(app)/layout.tsx` (authenticated layout)
- Triggers: Browser navigation
- Responsibilities: Auth check (redirect to /login if no user), sidebar + providers setup

**API Server:**
- Location: `apps/api/src/index.ts`
- Triggers: HTTP requests on port 3001
- Responsibilities: Fastify setup, CORS, rate limiting, Sentry, route registration, BullMQ worker startup

**Voice Server:**
- Location: `apps/voice/src/index.ts`
- Triggers: WebSocket connections on port 3002
- Responsibilities: JWT auth, VoiceSession/VoicePipeline lifecycle, audio routing

**Coach Server:**
- Location: `apps/coach/src/index.ts`
- Triggers: WebSocket connections on port 3003
- Responsibilities: JWT auth, CoachingSession lifecycle, insight persistence

**Extension:**
- Location: `apps/extension/src/background.ts`
- Triggers: Chrome runtime messages from popup
- Responsibilities: Tab audio capture, WebSocket connection to Coach service

## Error Handling

**Strategy:** Structured error responses with error codes, Sentry for production error tracking

**Patterns:**
- API routes use `sendValidationError()`, `sendUnauthorized()`, `sendForbidden()` from `apps/api/src/lib/http-errors.ts`
- All API errors return `{ code: string, message: string, fieldErrors?: [...] }` shape
- Fastify global error handler captures to Sentry with full request context, logs locally, returns JSON
- Auth errors use typed `AuthError` class with codes: `expired`, `malformed`, `missing_claims`, `invalid`
- Voice/Coach services log errors to console and send `{ type: "error", message }` events to WebSocket clients
- BullMQ workers use 3 retries with exponential backoff; failures logged to console

## Cross-Cutting Concerns

**Logging:** Pino (via Fastify) for API; `console.log/warn/error` with `[tag]` prefixes for Voice, Coach, and queue workers

**Validation:** Zod schemas for request validation in API routes; shared domain schemas in `@maxima/shared`

**Authentication:** Supabase Auth (JWT-based); `@maxima/auth` package verifies tokens across all services; Web uses Supabase SSR cookies; API/Voice/Coach use Bearer tokens or query param tokens

**Observability:** Sentry error tracking + profiling (API only, production); PostHog analytics (Web only); cost tracking per voice session

**Rate Limiting:** `@fastify/rate-limit` registered on API server (`apps/api/src/lib/rate-limit.ts`)

---

*Architecture analysis: 2026-03-06*
