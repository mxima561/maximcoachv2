# Codebase Structure

**Analysis Date:** 2026-03-06

## Directory Layout

```
maximcoachv2/
├── apps/
│   ├── api/                    # Fastify REST API (port 3001)
│   ├── voice/                  # Voice simulation WebSocket server (port 3002)
│   ├── coach/                  # Live coaching WebSocket server (port 3003)
│   ├── web/                    # Next.js 16 frontend (port 3000)
│   └── extension/              # Chrome extension for live call coaching
├── packages/
│   ├── shared/                 # Domain schemas, constants, feature gates
│   ├── auth/                   # JWT verification shared across services
│   └── voice-core/             # Voice pipeline primitives (STT, LLM, state machine)
├── supabase/
│   ├── migrations/             # Postgres schema migrations
│   └── tests/                  # Database tests
├── e2e/                        # End-to-end Playwright tests
├── scripts/                    # Utility scripts (env contract, staging smoke)
├── docs/                       # Documentation and plans
│   └── plans/                  # Planning documents
├── turbo.json                  # Turborepo task config
├── pnpm-workspace.yaml         # Workspace definition
├── vitest.config.ts            # Root vitest config
├── playwright.config.ts        # Playwright E2E config
├── do-app-spec.yaml            # DigitalOcean App Platform deployment spec
├── docker-compose.yml          # Local multi-service Docker setup
└── tsconfig.base.json          # Shared TypeScript config
```

## Directory Purposes

**`apps/api/`:**
- Purpose: REST API handling all business logic, AI scoring, billing, CRM, gamification
- Contains: Fastify route handlers, middleware, BullMQ queue workers
- Key files:
  - `src/index.ts`: Server entry point, route registration, Sentry init, worker startup
  - `src/routes/`: One file per route domain (e.g., `sessions.ts`, `scorecard.ts`, `billing.ts`)
  - `src/lib/auth.ts`: `requireAuth()` and `requireOrgMembership()` guards
  - `src/lib/supabase.ts`: Service-role Supabase client factory
  - `src/lib/queues.ts`: BullMQ queue definitions and worker implementations
  - `src/lib/http-errors.ts`: Typed error response helpers
  - `src/lib/rate-limit.ts`: Rate limiting config
  - `src/lib/crm-sync.ts`: Salesforce/HubSpot sync logic
  - `src/lib/adaptive-difficulty.ts`: ELO-based difficulty adjustment
  - `src/lib/audio-compress.ts`: PCM to Opus compression
  - `src/lib/push.ts`: Web push notification delivery

**`apps/voice/`:**
- Purpose: Real-time voice simulation pipeline over WebSocket
- Contains: WebSocket server, pipeline orchestrator, STT/TTS/LLM modules
- Key files:
  - `src/index.ts`: WebSocket server, auth, session lifecycle
  - `src/pipeline.ts`: `VoicePipeline` class wiring STT -> LLM -> TTS
  - `src/session.ts`: `VoiceSession` per-connection state
  - `src/stt.ts`: Deepgram STT integration
  - `src/tts.ts`: ElevenLabs TTS integration
  - `src/llm.ts`: OpenAI GPT-4o persona conversation generation
  - `src/state-machine.ts`: Voice state transitions
  - `src/cost-tracker.ts`: Per-session cost accumulation

**`apps/coach/`:**
- Purpose: Real-time live call coaching over WebSocket
- Contains: WebSocket server, coaching session manager
- Key files:
  - `src/index.ts`: WebSocket server, auth, session lifecycle
  - `src/coaching-session.ts`: `CoachingSession` class with real-time analysis
  - `src/supabase.ts`: Service-role client for insight persistence
  - `src/types.ts`: Client/server message types

**`apps/web/`:**
- Purpose: Next.js frontend with App Router, Supabase SSR auth, TailwindCSS 4
- Contains: Pages, components, hooks, Supabase client utilities
- Key files:
  - `src/app/layout.tsx`: Root layout (GeistSans font, force-dynamic)
  - `src/app/(app)/layout.tsx`: Authenticated layout (auth check, sidebar, providers)
  - `src/components/providers.tsx`: React Query + PostHog initialization
  - `src/lib/supabase/server.ts`: Server-side Supabase client (cookie-based)
  - `src/lib/supabase/client.ts`: Browser-side Supabase client
  - `src/lib/supabase/service.ts`: Service-role Supabase client (for API routes)
  - `src/lib/posthog.ts`: PostHog analytics initialization
  - `src/lib/utils.ts`: Utility functions (cn, etc.)
  - `src/app/auth/callback/route.ts`: OAuth callback (org check -> onboarding redirect)

**`apps/extension/`:**
- Purpose: Chrome extension for live call coaching
- Contains: Background script, popup, content script
- Key files:
  - `src/background.ts`: Tab audio capture, WebSocket to Coach service
  - `src/popup.ts`: Extension popup UI
  - `src/content.ts`: Content script
  - `src/types.ts`: Shared types
  - `icons/`: Extension icons

**`packages/shared/`:**
- Purpose: Domain types and constants shared across all apps
- Contains: Zod schemas, string literal constants, feature gate logic
- Key files:
  - `src/index.ts`: Re-exports from constants and schemas
  - `src/schemas.ts`: Zod schemas for Organization, User, Lead, Persona, Session, Transcript, Scorecard, Scenario, Integration, CoachingInsight
  - `src/constants.ts`: ROLES, SCENARIO_TYPES, SESSION_STATUSES, PLANS, PLAN_DETAILS, FEATURE_GATES, `canAccess()`

**`packages/auth/`:**
- Purpose: JWT token verification shared across backend services
- Contains: Token verification (3 modes), token extraction from headers/query
- Key files:
  - `src/index.ts`: `verifyToken()`, `extractToken()`, `AuthError` class

**`packages/voice-core/`:**
- Purpose: Reusable voice pipeline building blocks
- Contains: STT wrapper, LLM helpers, state machine, cost tracking, types
- Key files:
  - `src/index.ts`: Re-exports all modules
  - `src/stt.ts`: `DeepgramSTT` class
  - `src/llm.ts`: `generateLLMResponse()`, `filterByContextWindow()`
  - `src/state-machine.ts`: `VoiceStateMachine`
  - `src/cost-tracker.ts`: `CostTracker`
  - `src/types.ts`: Shared voice types (AudioChunk, TranscriptResult, VoiceState, etc.)

**`supabase/`:**
- Purpose: Database schema and migrations
- Contains: SQL migration files, database tests
- Key migrations:
  - `20260214000001_organizations_users.sql`: Core org/user tables
  - `20260214000002_core_tables.sql`: Sessions, transcripts, scorecards, personas, leads
  - `20260214000003_embeddings.sql`: Vector embeddings
  - `20260214000004_competitive_tables.sql`: Challenges, leaderboards
  - `20260304000001_gamification.sql`: XP, badges, ranks
  - `20260304000002_drills_and_plans.sql`: Drills and training plans
  - `20260304000003_transcripts_and_social.sql`: Call transcripts and social features
  - `20260304000004_notifications.sql`: Push notification subscriptions
  - `20260304000005_audio_recordings.sql`: Audio storage metadata

## Key File Locations

**Entry Points:**
- `apps/api/src/index.ts`: API server startup
- `apps/voice/src/index.ts`: Voice server startup
- `apps/coach/src/index.ts`: Coach server startup
- `apps/web/src/app/layout.tsx`: Web root layout
- `apps/extension/src/background.ts`: Extension background script

**Configuration:**
- `turbo.json`: Turborepo build/dev/lint/test task definitions
- `pnpm-workspace.yaml`: Workspace packages (apps/*, packages/*)
- `tsconfig.base.json`: Shared TypeScript compiler options
- `vitest.config.ts`: Root test runner config
- `playwright.config.ts`: E2E test config
- `do-app-spec.yaml`: DigitalOcean deployment spec
- `docker-compose.yml`: Local multi-service setup

**Core Logic:**
- `apps/api/src/routes/scorecard.ts`: AI-powered session scoring
- `apps/api/src/routes/persona.ts`: AI persona generation
- `apps/api/src/routes/sessions.ts`: Session creation with trial enforcement
- `apps/api/src/routes/billing.ts`: Stripe billing integration
- `apps/api/src/lib/queues.ts`: All background job workers
- `apps/voice/src/pipeline.ts`: Voice simulation pipeline
- `apps/coach/src/coaching-session.ts`: Live coaching session

**Testing:**
- `e2e/`: Root-level E2E tests
- `apps/web/e2e/`: Web-specific E2E tests
- `apps/api/src/__tests__/`: API unit tests
- `apps/api/src/routes/gamification.test.ts`: Route-colocated test
- `apps/api/src/lib/http-errors.test.ts`: Lib-colocated test
- `packages/shared/src/__tests__/`: Shared package tests
- `packages/voice-core/src/__tests__/`: Voice-core tests
- `packages/auth/src/__tests__/`: Auth package tests

## Naming Conventions

**Files:**
- kebab-case for all source files: `coaching-session.ts`, `http-errors.ts`, `cost-tracker.ts`
- Route files named by domain: `sessions.ts`, `billing.ts`, `gamification.ts`
- Test files: `*.test.ts` (colocated with source or in `__tests__/` directory)
- React components: kebab-case files with PascalCase exports: `app-sidebar.tsx` -> `AppSidebar`

**Directories:**
- lowercase with hyphens for multi-word: `voice-core/`, `crm-salesforce`
- Next.js route groups use parentheses: `(app)/`
- Next.js dynamic routes use brackets: `[sessionId]/`, `[id]/`
- Test directories: `__tests__/`

**Packages:**
- Scoped under `@maxima/`: `@maxima/api`, `@maxima/web`, `@maxima/shared`, `@maxima/auth`, `@maxima/voice-core`
- Workspace references use `workspace:*`

**Database:**
- Table names: snake_case plural (`sessions`, `scorecards`, `organization_users`)
- Column names: snake_case (`user_id`, `org_id`, `created_at`)
- Migration files: `YYYYMMDDHHMMSS_description.sql`

## Where to Add New Code

**New API Route:**
- Create route file: `apps/api/src/routes/{domain}.ts`
- Export an async function: `export async function {domain}Routes(app: FastifyInstance) { ... }`
- Register in `apps/api/src/index.ts`: `await app.register({domain}Routes);`
- Use `requireAuth()` guard from `apps/api/src/lib/auth.ts`
- Use `createServiceClient()` from `apps/api/src/lib/supabase.ts` for DB access
- Validate input with Zod schemas

**New Web Page:**
- Create page at `apps/web/src/app/(app)/{route}/page.tsx`
- For dynamic routes: `apps/web/src/app/(app)/{route}/[param]/page.tsx`
- All pages under `(app)` are auto-protected by the layout auth check
- Use `createClient()` from `@/lib/supabase/client` for client-side data
- Use `createClient()` from `@/lib/supabase/server` for server components

**New React Component:**
- Shared UI components: `apps/web/src/components/ui/{name}.tsx`
- Feature components: `apps/web/src/components/{name}.tsx`
- Feature component groups: `apps/web/src/components/{feature}/{name}.tsx`
- Use shadcn/radix patterns for UI primitives

**New React Hook:**
- Place in `apps/web/src/hooks/use-{name}.ts`
- Prefix with `use-`

**New Shared Type/Schema:**
- Add Zod schema to `packages/shared/src/schemas.ts`
- Add constants to `packages/shared/src/constants.ts`
- Re-export from `packages/shared/src/index.ts`

**New Database Migration:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_{description}.sql`

**New Background Job:**
- Add queue accessor in `apps/api/src/lib/queues.ts` (follow lazy init pattern)
- Add worker in `startWorkers()` function
- Enqueue from route handlers via `get{Name}Queue()?.add(...)`

**New API Lib/Utility:**
- Place in `apps/api/src/lib/{name}.ts`
- Export functions, import in routes as needed

**New Voice/Coach Feature:**
- Shared primitives: `packages/voice-core/src/{name}.ts` (re-export from index)
- Service-specific: `apps/voice/src/{name}.ts` or `apps/coach/src/{name}.ts`

## Special Directories

**`supabase/migrations/`:**
- Purpose: SQL migration files applied in order to Supabase Postgres
- Generated: No (hand-written)
- Committed: Yes

**`apps/web/.next/`:**
- Purpose: Next.js build output and cache
- Generated: Yes
- Committed: No

**`*/dist/`:**
- Purpose: TypeScript compilation output for each package/app
- Generated: Yes (via `tsc`)
- Committed: No

**`.turbo/`:**
- Purpose: Turborepo build cache
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: By tooling
- Committed: Yes

---

*Structure analysis: 2026-03-06*

# Codebase Structure

**Analysis Date:** 2026-03-06

## Directory Layout

```
maximcoachv2/
├── apps/
│   ├── api/                    # Fastify REST API (port 3001)
│   ├── voice/                  # Voice simulation WebSocket server (port 3002)
│   ├── coach/                  # Live coaching WebSocket server (port 3003)
│   ├── web/                    # Next.js 16 frontend (port 3000)
│   └── extension/              # Chrome extension for live call coaching
├── packages/
│   ├── shared/                 # Domain schemas, constants, feature gates
│   ├── auth/                   # JWT verification shared across services
│   └── voice-core/             # Voice pipeline primitives (STT, LLM, state machine)
├── supabase/
│   ├── migrations/             # Postgres schema migrations
│   └── tests/                  # Database tests
├── e2e/                        # End-to-end Playwright tests
├── scripts/                    # Utility scripts (env contract, staging smoke)
├── docs/                       # Documentation and plans
│   └── plans/                  # Planning documents
├── turbo.json                  # Turborepo task config
├── pnpm-workspace.yaml         # Workspace definition
├── vitest.config.ts            # Root vitest config
├── playwright.config.ts        # Playwright E2E config
├── do-app-spec.yaml            # DigitalOcean App Platform deployment spec
├── docker-compose.yml          # Local multi-service Docker setup
└── tsconfig.base.json          # Shared TypeScript config
```

## Directory Purposes

**`apps/api/`:**
- Purpose: REST API handling all business logic, AI scoring, billing, CRM, gamification
- Contains: Fastify route handlers, middleware, BullMQ queue workers
- Key files:
  - `src/index.ts`: Server entry point, route registration, Sentry init, worker startup
  - `src/routes/`: One file per route domain (e.g., `sessions.ts`, `scorecard.ts`, `billing.ts`)
  - `src/lib/auth.ts`: `requireAuth()` and `requireOrgMembership()` guards
  - `src/lib/supabase.ts`: Service-role Supabase client factory
  - `src/lib/queues.ts`: BullMQ queue definitions and worker implementations
  - `src/lib/http-errors.ts`: Typed error response helpers
  - `src/lib/rate-limit.ts`: Rate limiting config
  - `src/lib/crm-sync.ts`: Salesforce/HubSpot sync logic
  - `src/lib/adaptive-difficulty.ts`: ELO-based difficulty adjustment
  - `src/lib/audio-compress.ts`: PCM to Opus compression
  - `src/lib/push.ts`: Web push notification delivery

**`apps/voice/`:**
- Purpose: Real-time voice simulation pipeline over WebSocket
- Contains: WebSocket server, pipeline orchestrator, STT/TTS/LLM modules
- Key files:
  - `src/index.ts`: WebSocket server, auth, session lifecycle
  - `src/pipeline.ts`: `VoicePipeline` class wiring STT -> LLM -> TTS
  - `src/session.ts`: `VoiceSession` per-connection state
  - `src/stt.ts`: Deepgram STT integration
  - `src/tts.ts`: ElevenLabs TTS integration
  - `src/llm.ts`: OpenAI GPT-4o persona conversation generation
  - `src/state-machine.ts`: Voice state transitions
  - `src/cost-tracker.ts`: Per-session cost accumulation

**`apps/coach/`:**
- Purpose: Real-time live call coaching over WebSocket
- Contains: WebSocket server, coaching session manager
- Key files:
  - `src/index.ts`: WebSocket server, auth, session lifecycle
  - `src/coaching-session.ts`: `CoachingSession` class with real-time analysis
  - `src/supabase.ts`: Service-role client for insight persistence
  - `src/types.ts`: Client/server message types

**`apps/web/`:**
- Purpose: Next.js frontend with App Router, Supabase SSR auth, TailwindCSS 4
- Contains: Pages, components, hooks, Supabase client utilities
- Key files:
  - `src/app/layout.tsx`: Root layout (GeistSans font, force-dynamic)
  - `src/app/(app)/layout.tsx`: Authenticated layout (auth check, sidebar, providers)
  - `src/components/providers.tsx`: React Query + PostHog initialization
  - `src/lib/supabase/server.ts`: Server-side Supabase client (cookie-based)
  - `src/lib/supabase/client.ts`: Browser-side Supabase client
  - `src/lib/supabase/service.ts`: Service-role Supabase client (for API routes)
  - `src/lib/posthog.ts`: PostHog analytics initialization
  - `src/lib/utils.ts`: Utility functions (cn, etc.)
  - `src/app/auth/callback/route.ts`: OAuth callback (org check -> onboarding redirect)

**`apps/extension/`:**
- Purpose: Chrome extension for live call coaching
- Contains: Background script, popup, content script
- Key files:
  - `src/background.ts`: Tab audio capture, WebSocket to Coach service
  - `src/popup.ts`: Extension popup UI
  - `src/content.ts`: Content script
  - `src/types.ts`: Shared types
  - `icons/`: Extension icons

**`packages/shared/`:**
- Purpose: Domain types and constants shared across all apps
- Contains: Zod schemas, string literal constants, feature gate logic
- Key files:
  - `src/index.ts`: Re-exports from constants and schemas
  - `src/schemas.ts`: Zod schemas for Organization, User, Lead, Persona, Session, Transcript, Scorecard, Scenario, Integration, CoachingInsight
  - `src/constants.ts`: ROLES, SCENARIO_TYPES, SESSION_STATUSES, PLANS, PLAN_DETAILS, FEATURE_GATES, `canAccess()`

**`packages/auth/`:**
- Purpose: JWT token verification shared across backend services
- Contains: Token verification (3 modes), token extraction from headers/query
- Key files:
  - `src/index.ts`: `verifyToken()`, `extractToken()`, `AuthError` class

**`packages/voice-core/`:**
- Purpose: Reusable voice pipeline building blocks
- Contains: STT wrapper, LLM helpers, state machine, cost tracking, types
- Key files:
  - `src/index.ts`: Re-exports all modules
  - `src/stt.ts`: `DeepgramSTT` class
  - `src/llm.ts`: `generateLLMResponse()`, `filterByContextWindow()`
  - `src/state-machine.ts`: `VoiceStateMachine`
  - `src/cost-tracker.ts`: `CostTracker`
  - `src/types.ts`: Shared voice types (AudioChunk, TranscriptResult, VoiceState, etc.)

**`supabase/`:**
- Purpose: Database schema and migrations
- Contains: SQL migration files, database tests
- Key migrations:
  - `20260214000001_organizations_users.sql`: Core org/user tables
  - `20260214000002_core_tables.sql`: Sessions, transcripts, scorecards, personas, leads
  - `20260214000003_embeddings.sql`: Vector embeddings
  - `20260214000004_competitive_tables.sql`: Challenges, leaderboards
  - `20260304000001_gamification.sql`: XP, badges, ranks
  - `20260304000002_drills_and_plans.sql`: Drills and training plans
  - `20260304000003_transcripts_and_social.sql`: Call transcripts and social features
  - `20260304000004_notifications.sql`: Push notification subscriptions
  - `20260304000005_audio_recordings.sql`: Audio storage metadata

## Key File Locations

**Entry Points:**
- `apps/api/src/index.ts`: API server startup
- `apps/voice/src/index.ts`: Voice server startup
- `apps/coach/src/index.ts`: Coach server startup
- `apps/web/src/app/layout.tsx`: Web root layout
- `apps/extension/src/background.ts`: Extension background script

**Configuration:**
- `turbo.json`: Turborepo build/dev/lint/test task definitions
- `pnpm-workspace.yaml`: Workspace packages (apps/*, packages/*)
- `tsconfig.base.json`: Shared TypeScript compiler options
- `vitest.config.ts`: Root test runner config
- `playwright.config.ts`: E2E test config
- `do-app-spec.yaml`: DigitalOcean deployment spec
- `docker-compose.yml`: Local multi-service setup

**Core Logic:**
- `apps/api/src/routes/scorecard.ts`: AI-powered session scoring
- `apps/api/src/routes/persona.ts`: AI persona generation
- `apps/api/src/routes/sessions.ts`: Session creation with trial enforcement
- `apps/api/src/routes/billing.ts`: Stripe billing integration
- `apps/api/src/lib/queues.ts`: All background job workers
- `apps/voice/src/pipeline.ts`: Voice simulation pipeline
- `apps/coach/src/coaching-session.ts`: Live coaching session

**Testing:**
- `e2e/`: Root-level E2E tests
- `apps/web/e2e/`: Web-specific E2E tests
- `apps/api/src/__tests__/`: API unit tests
- `apps/api/src/routes/gamification.test.ts`: Route-colocated test
- `apps/api/src/lib/http-errors.test.ts`: Lib-colocated test
- `packages/shared/src/__tests__/`: Shared package tests
- `packages/voice-core/src/__tests__/`: Voice-core tests
- `packages/auth/src/__tests__/`: Auth package tests

## Naming Conventions

**Files:**
- kebab-case for all source files: `coaching-session.ts`, `http-errors.ts`, `cost-tracker.ts`
- Route files named by domain: `sessions.ts`, `billing.ts`, `gamification.ts`
- Test files: `*.test.ts` (colocated with source or in `__tests__/` directory)
- React components: kebab-case files with PascalCase exports: `app-sidebar.tsx` -> `AppSidebar`

**Directories:**
- lowercase with hyphens for multi-word: `voice-core/`, `crm-salesforce`
- Next.js route groups use parentheses: `(app)/`
- Next.js dynamic routes use brackets: `[sessionId]/`, `[id]/`
- Test directories: `__tests__/`

**Packages:**
- Scoped under `@maxima/`: `@maxima/api`, `@maxima/web`, `@maxima/shared`, `@maxima/auth`, `@maxima/voice-core`
- Workspace references use `workspace:*`

**Database:**
- Table names: snake_case plural (`sessions`, `scorecards`, `organization_users`)
- Column names: snake_case (`user_id`, `org_id`, `created_at`)
- Migration files: `YYYYMMDDHHMMSS_description.sql`

## Where to Add New Code

**New API Route:**
- Create route file: `apps/api/src/routes/{domain}.ts`
- Export an async function: `export async function {domain}Routes(app: FastifyInstance) { ... }`
- Register in `apps/api/src/index.ts`: `await app.register({domain}Routes);`
- Use `requireAuth()` guard from `apps/api/src/lib/auth.ts`
- Use `createServiceClient()` from `apps/api/src/lib/supabase.ts` for DB access
- Validate input with Zod schemas

**New Web Page:**
- Create page at `apps/web/src/app/(app)/{route}/page.tsx`
- For dynamic routes: `apps/web/src/app/(app)/{route}/[param]/page.tsx`
- All pages under `(app)` are auto-protected by the layout auth check
- Use `createClient()` from `@/lib/supabase/client` for client-side data
- Use `createClient()` from `@/lib/supabase/server` for server components

**New React Component:**
- Shared UI components: `apps/web/src/components/ui/{name}.tsx`
- Feature components: `apps/web/src/components/{name}.tsx`
- Feature component groups: `apps/web/src/components/{feature}/{name}.tsx`
- Use shadcn/radix patterns for UI primitives

**New React Hook:**
- Place in `apps/web/src/hooks/use-{name}.ts`
- Prefix with `use-`

**New Shared Type/Schema:**
- Add Zod schema to `packages/shared/src/schemas.ts`
- Add constants to `packages/shared/src/constants.ts`
- Re-export from `packages/shared/src/index.ts`

**New Database Migration:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_{description}.sql`

**New Background Job:**
- Add queue accessor in `apps/api/src/lib/queues.ts` (follow lazy init pattern)
- Add worker in `startWorkers()` function
- Enqueue from route handlers via `get{Name}Queue()?.add(...)`

**New API Lib/Utility:**
- Place in `apps/api/src/lib/{name}.ts`
- Export functions, import in routes as needed

**New Voice/Coach Feature:**
- Shared primitives: `packages/voice-core/src/{name}.ts` (re-export from index)
- Service-specific: `apps/voice/src/{name}.ts` or `apps/coach/src/{name}.ts`

## Special Directories

**`supabase/migrations/`:**
- Purpose: SQL migration files applied in order to Supabase Postgres
- Generated: No (hand-written)
- Committed: Yes

**`apps/web/.next/`:**
- Purpose: Next.js build output and cache
- Generated: Yes
- Committed: No

**`*/dist/`:**
- Purpose: TypeScript compilation output for each package/app
- Generated: Yes (via `tsc`)
- Committed: No

**`.turbo/`:**
- Purpose: Turborepo build cache
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: By tooling
- Committed: Yes

---

*Structure analysis: 2026-03-06*

# Codebase Structure

**Analysis Date:** 2026-03-06

## Directory Layout

```
maximcoachv2/
├── apps/
│   ├── api/                    # Fastify REST API (port 3001)
│   ├── voice/                  # Voice simulation WebSocket server (port 3002)
│   ├── coach/                  # Live coaching WebSocket server (port 3003)
│   ├── web/                    # Next.js 16 frontend (port 3000)
│   └── extension/              # Chrome extension for live call coaching
├── packages/
│   ├── shared/                 # Domain schemas, constants, feature gates
│   ├── auth/                   # JWT verification shared across services
│   └── voice-core/             # Voice pipeline primitives (STT, LLM, state machine)
├── supabase/
│   ├── migrations/             # Postgres schema migrations
│   └── tests/                  # Database tests
├── e2e/                        # End-to-end Playwright tests
├── scripts/                    # Utility scripts (env contract, staging smoke)
├── docs/                       # Documentation and plans
│   └── plans/                  # Planning documents
├── turbo.json                  # Turborepo task config
├── pnpm-workspace.yaml         # Workspace definition
├── vitest.config.ts            # Root vitest config
├── playwright.config.ts        # Playwright E2E config
├── do-app-spec.yaml            # DigitalOcean App Platform deployment spec
├── docker-compose.yml          # Local multi-service Docker setup
└── tsconfig.base.json          # Shared TypeScript config
```

## Directory Purposes

**`apps/api/`:**
- Purpose: REST API handling all business logic, AI scoring, billing, CRM, gamification
- Contains: Fastify route handlers, middleware, BullMQ queue workers
- Key files:
  - `src/index.ts`: Server entry point, route registration, Sentry init, worker startup
  - `src/routes/`: One file per route domain (e.g., `sessions.ts`, `scorecard.ts`, `billing.ts`)
  - `src/lib/auth.ts`: `requireAuth()` and `requireOrgMembership()` guards
  - `src/lib/supabase.ts`: Service-role Supabase client factory
  - `src/lib/queues.ts`: BullMQ queue definitions and worker implementations
  - `src/lib/http-errors.ts`: Typed error response helpers
  - `src/lib/rate-limit.ts`: Rate limiting config
  - `src/lib/crm-sync.ts`: Salesforce/HubSpot sync logic
  - `src/lib/adaptive-difficulty.ts`: ELO-based difficulty adjustment
  - `src/lib/audio-compress.ts`: PCM to Opus compression
  - `src/lib/push.ts`: Web push notification delivery

**`apps/voice/`:**
- Purpose: Real-time voice simulation pipeline over WebSocket
- Contains: WebSocket server, pipeline orchestrator, STT/TTS/LLM modules
- Key files:
  - `src/index.ts`: WebSocket server, auth, session lifecycle
  - `src/pipeline.ts`: `VoicePipeline` class wiring STT -> LLM -> TTS
  - `src/session.ts`: `VoiceSession` per-connection state
  - `src/stt.ts`: Deepgram STT integration
  - `src/tts.ts`: ElevenLabs TTS integration
  - `src/llm.ts`: OpenAI GPT-4o persona conversation generation
  - `src/state-machine.ts`: Voice state transitions
  - `src/cost-tracker.ts`: Per-session cost accumulation

**`apps/coach/`:**
- Purpose: Real-time live call coaching over WebSocket
- Contains: WebSocket server, coaching session manager
- Key files:
  - `src/index.ts`: WebSocket server, auth, session lifecycle
  - `src/coaching-session.ts`: `CoachingSession` class with real-time analysis
  - `src/supabase.ts`: Service-role client for insight persistence
  - `src/types.ts`: Client/server message types

**`apps/web/`:**
- Purpose: Next.js frontend with App Router, Supabase SSR auth, TailwindCSS 4
- Contains: Pages, components, hooks, Supabase client utilities
- Key files:
  - `src/app/layout.tsx`: Root layout (GeistSans font, force-dynamic)
  - `src/app/(app)/layout.tsx`: Authenticated layout (auth check, sidebar, providers)
  - `src/components/providers.tsx`: React Query + PostHog initialization
  - `src/lib/supabase/server.ts`: Server-side Supabase client (cookie-based)
  - `src/lib/supabase/client.ts`: Browser-side Supabase client
  - `src/lib/supabase/service.ts`: Service-role Supabase client (for API routes)
  - `src/lib/posthog.ts`: PostHog analytics initialization
  - `src/lib/utils.ts`: Utility functions (cn, etc.)
  - `src/app/auth/callback/route.ts`: OAuth callback (org check -> onboarding redirect)

**`apps/extension/`:**
- Purpose: Chrome extension for live call coaching
- Contains: Background script, popup, content script
- Key files:
  - `src/background.ts`: Tab audio capture, WebSocket to Coach service
  - `src/popup.ts`: Extension popup UI
  - `src/content.ts`: Content script
  - `src/types.ts`: Shared types
  - `icons/`: Extension icons

**`packages/shared/`:**
- Purpose: Domain types and constants shared across all apps
- Contains: Zod schemas, string literal constants, feature gate logic
- Key files:
  - `src/index.ts`: Re-exports from constants and schemas
  - `src/schemas.ts`: Zod schemas for Organization, User, Lead, Persona, Session, Transcript, Scorecard, Scenario, Integration, CoachingInsight
  - `src/constants.ts`: ROLES, SCENARIO_TYPES, SESSION_STATUSES, PLANS, PLAN_DETAILS, FEATURE_GATES, `canAccess()`

**`packages/auth/`:**
- Purpose: JWT token verification shared across backend services
- Contains: Token verification (3 modes), token extraction from headers/query
- Key files:
  - `src/index.ts`: `verifyToken()`, `extractToken()`, `AuthError` class

**`packages/voice-core/`:**
- Purpose: Reusable voice pipeline building blocks
- Contains: STT wrapper, LLM helpers, state machine, cost tracking, types
- Key files:
  - `src/index.ts`: Re-exports all modules
  - `src/stt.ts`: `DeepgramSTT` class
  - `src/llm.ts`: `generateLLMResponse()`, `filterByContextWindow()`
  - `src/state-machine.ts`: `VoiceStateMachine`
  - `src/cost-tracker.ts`: `CostTracker`
  - `src/types.ts`: Shared voice types (AudioChunk, TranscriptResult, VoiceState, etc.)

**`supabase/`:**
- Purpose: Database schema and migrations
- Contains: SQL migration files, database tests
- Key migrations:
  - `20260214000001_organizations_users.sql`: Core org/user tables
  - `20260214000002_core_tables.sql`: Sessions, transcripts, scorecards, personas, leads
  - `20260214000003_embeddings.sql`: Vector embeddings
  - `20260214000004_competitive_tables.sql`: Challenges, leaderboards
  - `20260304000001_gamification.sql`: XP, badges, ranks
  - `20260304000002_drills_and_plans.sql`: Drills and training plans
  - `20260304000003_transcripts_and_social.sql`: Call transcripts and social features
  - `20260304000004_notifications.sql`: Push notification subscriptions
  - `20260304000005_audio_recordings.sql`: Audio storage metadata

## Key File Locations

**Entry Points:**
- `apps/api/src/index.ts`: API server startup
- `apps/voice/src/index.ts`: Voice server startup
- `apps/coach/src/index.ts`: Coach server startup
- `apps/web/src/app/layout.tsx`: Web root layout
- `apps/extension/src/background.ts`: Extension background script

**Configuration:**
- `turbo.json`: Turborepo build/dev/lint/test task definitions
- `pnpm-workspace.yaml`: Workspace packages (apps/*, packages/*)
- `tsconfig.base.json`: Shared TypeScript compiler options
- `vitest.config.ts`: Root test runner config
- `playwright.config.ts`: E2E test config
- `do-app-spec.yaml`: DigitalOcean deployment spec
- `docker-compose.yml`: Local multi-service setup

**Core Logic:**
- `apps/api/src/routes/scorecard.ts`: AI-powered session scoring
- `apps/api/src/routes/persona.ts`: AI persona generation
- `apps/api/src/routes/sessions.ts`: Session creation with trial enforcement
- `apps/api/src/routes/billing.ts`: Stripe billing integration
- `apps/api/src/lib/queues.ts`: All background job workers
- `apps/voice/src/pipeline.ts`: Voice simulation pipeline
- `apps/coach/src/coaching-session.ts`: Live coaching session

**Testing:**
- `e2e/`: Root-level E2E tests
- `apps/web/e2e/`: Web-specific E2E tests
- `apps/api/src/__tests__/`: API unit tests
- `apps/api/src/routes/gamification.test.ts`: Route-colocated test
- `apps/api/src/lib/http-errors.test.ts`: Lib-colocated test
- `packages/shared/src/__tests__/`: Shared package tests
- `packages/voice-core/src/__tests__/`: Voice-core tests
- `packages/auth/src/__tests__/`: Auth package tests

## Naming Conventions

**Files:**
- kebab-case for all source files: `coaching-session.ts`, `http-errors.ts`, `cost-tracker.ts`
- Route files named by domain: `sessions.ts`, `billing.ts`, `gamification.ts`
- Test files: `*.test.ts` (colocated with source or in `__tests__/` directory)
- React components: kebab-case files with PascalCase exports: `app-sidebar.tsx` -> `AppSidebar`

**Directories:**
- lowercase with hyphens for multi-word: `voice-core/`, `crm-salesforce`
- Next.js route groups use parentheses: `(app)/`
- Next.js dynamic routes use brackets: `[sessionId]/`, `[id]/`
- Test directories: `__tests__/`

**Packages:**
- Scoped under `@maxima/`: `@maxima/api`, `@maxima/web`, `@maxima/shared`, `@maxima/auth`, `@maxima/voice-core`
- Workspace references use `workspace:*`

**Database:**
- Table names: snake_case plural (`sessions`, `scorecards`, `organization_users`)
- Column names: snake_case (`user_id`, `org_id`, `created_at`)
- Migration files: `YYYYMMDDHHMMSS_description.sql`

## Where to Add New Code

**New API Route:**
- Create route file: `apps/api/src/routes/{domain}.ts`
- Export an async function: `export async function {domain}Routes(app: FastifyInstance) { ... }`
- Register in `apps/api/src/index.ts`: `await app.register({domain}Routes);`
- Use `requireAuth()` guard from `apps/api/src/lib/auth.ts`
- Use `createServiceClient()` from `apps/api/src/lib/supabase.ts` for DB access
- Validate input with Zod schemas

**New Web Page:**
- Create page at `apps/web/src/app/(app)/{route}/page.tsx`
- For dynamic routes: `apps/web/src/app/(app)/{route}/[param]/page.tsx`
- All pages under `(app)` are auto-protected by the layout auth check
- Use `createClient()` from `@/lib/supabase/client` for client-side data
- Use `createClient()` from `@/lib/supabase/server` for server components

**New React Component:**
- Shared UI components: `apps/web/src/components/ui/{name}.tsx`
- Feature components: `apps/web/src/components/{name}.tsx`
- Feature component groups: `apps/web/src/components/{feature}/{name}.tsx`
- Use shadcn/radix patterns for UI primitives

**New React Hook:**
- Place in `apps/web/src/hooks/use-{name}.ts`
- Prefix with `use-`

**New Shared Type/Schema:**
- Add Zod schema to `packages/shared/src/schemas.ts`
- Add constants to `packages/shared/src/constants.ts`
- Re-export from `packages/shared/src/index.ts`

**New Database Migration:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_{description}.sql`

**New Background Job:**
- Add queue accessor in `apps/api/src/lib/queues.ts` (follow lazy init pattern)
- Add worker in `startWorkers()` function
- Enqueue from route handlers via `get{Name}Queue()?.add(...)`

**New API Lib/Utility:**
- Place in `apps/api/src/lib/{name}.ts`
- Export functions, import in routes as needed

**New Voice/Coach Feature:**
- Shared primitives: `packages/voice-core/src/{name}.ts` (re-export from index)
- Service-specific: `apps/voice/src/{name}.ts` or `apps/coach/src/{name}.ts`

## Special Directories

**`supabase/migrations/`:**
- Purpose: SQL migration files applied in order to Supabase Postgres
- Generated: No (hand-written)
- Committed: Yes

**`apps/web/.next/`:**
- Purpose: Next.js build output and cache
- Generated: Yes
- Committed: No

**`*/dist/`:**
- Purpose: TypeScript compilation output for each package/app
- Generated: Yes (via `tsc`)
- Committed: No

**`.turbo/`:**
- Purpose: Turborepo build cache
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: By tooling
- Committed: Yes

---

*Structure analysis: 2026-03-06*

