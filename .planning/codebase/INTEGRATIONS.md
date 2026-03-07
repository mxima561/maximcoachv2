# External Integrations

**Analysis Date:** 2026-03-06

## APIs & External Services

**AI / Language Models:**
- OpenAI GPT-4o - Persona generation, scorecard analysis, transcript analysis, real-time coaching
  - SDK: `@ai-sdk/openai` via Vercel AI SDK (`ai`)
  - Auth: `OPENAI_API_KEY`
  - Used in: `apps/api/src/routes/persona.ts`, `apps/api/src/lib/queues.ts` (transcript analysis), `apps/voice/src/llm.js`, `apps/coach/`

**Speech-to-Text:**
- Deepgram - Real-time speech transcription
  - SDK: `@deepgram/sdk` 4.11.3
  - Auth: `DEEPGRAM_API_KEY`
  - Used in: `apps/voice/src/stt.ts` (via `packages/voice-core`), `apps/coach/`

**Text-to-Speech:**
- ElevenLabs - Voice synthesis for AI buyer personas
  - SDK: `elevenlabs` 1.59.0 (server), `@elevenlabs/client` + `@elevenlabs/react` 0.14.0 (web)
  - Auth: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`
  - Used in: `apps/voice/src/tts.ts`, `apps/web/` (client-side playback)

**CRM Integrations:**
- Salesforce - Lead/contact import via OAuth 2.0 + PKCE
  - SDK: Direct REST API calls (no SDK)
  - Auth: `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, `SALESFORCE_REDIRECT_URI`
  - OAuth flow: `apps/api/src/routes/crm-salesforce.ts`
  - Sync worker: `apps/api/src/lib/crm-sync.js` (via BullMQ)
  - Endpoints: `/api/integrations/salesforce/auth`, `/callback`, `/sync`, `/:org_id/status`

- HubSpot - Contact/deal import via OAuth 2.0
  - SDK: Direct REST API calls (no SDK)
  - Auth: `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `HUBSPOT_REDIRECT_URI`
  - OAuth flow: `apps/api/src/routes/crm-hubspot.ts`
  - Sync worker: `apps/api/src/lib/crm-sync.js` (via BullMQ)
  - Scopes: `crm.objects.contacts.read crm.objects.deals.read`
  - Endpoints: `/api/integrations/hubspot/auth`, `/callback`, `/sync`, `/:org_id/status`

**Google:**
- Google Sheets - Data import (lead lists)
  - SDK: `googleapis` 171.4.0
  - Auth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - Used in: `apps/web/` (client-side OAuth)

## Data Storage

**Primary Database:**
- Supabase (PostgreSQL)
  - Connection: `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`
  - Auth keys: `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser), `SUPABASE_SERVICE_ROLE_KEY` (server)
  - Client: `@supabase/supabase-js` 2.95.3
  - SSR: `@supabase/ssr` 0.8.0 (web app)
  - Service client factory: `apps/api/src/lib/supabase.ts`
  - Migrations: 22 SQL files in `supabase/migrations/`
  - Features used: RLS, materialized views (leaderboards), RPC functions, storage buckets

**Key Database Tables (from migrations):**
- `organizations`, `organization_users` - Multi-tenant org structure
- `users` - User profiles with streak/gamification fields
- `leads`, `personas` - Sales simulation data
- `sessions`, `scorecards` - Training sessions and scoring
- `integrations` - CRM OAuth tokens
- `trial_sessions`, `trial_events` - Trial tracking
- `drills`, `daily_training_plans` - Training content
- `call_transcripts` - Uploaded transcript analysis
- `push_subscriptions` - Web push endpoints
- `audio_recordings` - Compressed session audio
- Leaderboard materialized views: `leaderboard_top_score`, `leaderboard_most_improved`, `leaderboard_consistency`, `leaderboard_streak`

**File Storage:**
- Supabase Storage - Audio recordings
  - Bucket: `audio`
  - Used for: Raw PCM upload, compressed Opus/OGG storage
  - Managed in: `apps/api/src/lib/queues.ts` (audio worker)

**Caching / Queue Backend:**
- Valkey 8 (Redis-compatible)
  - Connection: `VALKEY_URL` or `REDIS_URL`
  - Client: `ioredis` 5.9.3
  - Used for: BullMQ job queues, persona response caching (24h TTL)
  - Cache helper: `apps/api/src/routes/persona.ts` (Valkey get/set with `persona:` key prefix)
  - Valkey client factory: `apps/api/src/lib/valkey.ts`
  - Docker: `valkey/valkey:8-alpine` image

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (built-in)
  - Implementation: JWT-based, verified via `packages/auth/src/index.ts`
  - Three verification modes (fallback chain):
    1. Supabase client `getUser()` (primary, requires `SUPABASE_SERVICE_ROLE_KEY`)
    2. Direct JWT verification via `jose` (requires `SUPABASE_JWT_SECRET` or `JWT_SECRET`)
    3. JWKS remote key set from Supabase (requires `NEXT_PUBLIC_SUPABASE_URL`)
  - Token extraction: `Authorization: Bearer <token>` header or `?token=` query param
  - Auth middleware: `apps/api/src/lib/auth.ts` (`requireAuth`, `requireOrgMembership`)
  - Claims: `userId`, `email`, `orgId`, `role`

## Payments & Billing

**Payment Provider:**
- Stripe
  - SDK: `stripe` 20.3.1
  - API version: `2026-01-28.clover`
  - Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  - Price IDs: `STRIPE_SOLO_PRICE_ID`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, `STRIPE_SCALE_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID`
  - Implementation: `apps/api/src/routes/billing.ts`
  - Features: Checkout sessions, customer portal, subscription management, usage tracking
  - Plans: Solo ($29), Starter ($299), Growth ($599), Scale ($999), Enterprise ($1500+)

## Monitoring & Observability

**Error Tracking:**
- Sentry
  - Server: `@sentry/node` 10.38.0 + `@sentry/profiling-node` 10.38.0 in `apps/api/src/index.ts`
  - Web: `@sentry/nextjs` 10.38.0 in `apps/web/next.config.ts`
  - DSN: `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`
  - Org: `maximcoach`, Project: `maximcoach-web`
  - Config: traces sample rate 0.1, profiles sample rate 0.1, production only
  - Health check requests are filtered out

**Product Analytics:**
- PostHog
  - SDK: `posthog-js` 1.358.1
  - Auth: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
  - Host: `https://us.i.posthog.com`
  - Implementation: `apps/web/src/lib/posthog.ts`
  - Features: auto-capture, pageview tracking, page leave tracking, identified user profiles
  - Initialized in: `apps/web/src/components/providers.tsx`

**Logging:**
- Pino (API server) - Structured JSON logging in production, `pino-pretty` in development
- Console logging (voice, coach servers)

## CI/CD & Deployment

**Hosting:**
- DigitalOcean App Platform - API service
  - Spec: `do-app-spec.yaml`
  - Region: NYC
  - Instance: `basic-xxs`
  - Auto-deploy on push to `main`
- Vercel - Web app (implied by Next.js standalone + Sentry Vercel integration)

**CI Pipeline:**
- Not explicitly configured (no `.github/workflows` detected)
- Turborepo handles build pipeline: `build -> lint -> typecheck -> test`

**Docker:**
- `docker-compose.yml` - Full local stack (api, voice, coach, web, valkey)
- Individual Dockerfiles: `apps/api/Dockerfile`, `apps/voice/Dockerfile`, `apps/web/Dockerfile`

## Background Jobs (BullMQ)

**Queues and Scheduled Jobs:**

| Queue | Job | Schedule | Purpose |
|-------|-----|----------|---------|
| `crm-sync` | salesforce-sync, hubspot-sync | On-demand | CRM data import |
| `reports` | weekly-report | Mondays 6 AM UTC | Team performance reports |
| `reports` | refresh-leaderboards | Every 15 min | Materialized view refresh |
| `email` | (placeholder) | On-demand | Email sending (stub) |
| `gamification` | streak-reset | Hourly | Reset broken practice streaks |
| `gamification` | generate-daily-plans | Daily 5 AM UTC | Create training plans |
| `gamification` | badge-evaluation | On-demand | Badge unlock checks |
| `gamification` | transcript-analysis | On-demand | AI analysis of uploaded calls |
| `audio` | compress-session-audio | On-demand | PCM to Opus compression |

- Config: 3 retry attempts, exponential backoff (1s base)
- Implementation: `apps/api/src/lib/queues.ts`

## Webhooks & Callbacks

**Incoming:**
- Stripe webhook: `POST /api/billing/webhook` (`apps/api/src/routes/billing.ts`)
  - Events handled: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`
  - Signature verification via raw body parsing

- Salesforce OAuth callback: `GET /api/integrations/salesforce/callback`
- HubSpot OAuth callback: `GET /api/integrations/hubspot/callback`

**Outgoing:**
- Slack webhook (optional): `SLACK_WEBHOOK_URL` - Weekly team report notifications (`apps/api/src/lib/queues.ts`)
- Web Push notifications via VAPID: `apps/api/src/lib/push.ts`

## Push Notifications

**Implementation:**
- Server: `web-push` 3.6.7 in `apps/api/src/lib/push.ts`
- Client: `apps/web/src/hooks/use-push-notifications.ts`, `apps/web/public/sw.js`
- Auth: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`
- Storage: `push_subscriptions` table in Supabase
- Routes: `apps/api/src/routes/notifications.ts`
- Used for: streak warnings, training reminders

## Environment Configuration

**Required env vars (all services):**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase admin key
- `OPENAI_API_KEY` - OpenAI API

**API-specific:**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Billing
- `STRIPE_*_PRICE_ID` (5 plan tiers) - Subscription prices
- `VALKEY_URL` or `REDIS_URL` - Job queue backend
- `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, `SALESFORCE_REDIRECT_URI` - CRM
- `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `HUBSPOT_REDIRECT_URI` - CRM
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` - Push notifications
- `SENTRY_DSN` - Error tracking
- `WEB_ORIGIN` - CORS origin
- `SLACK_WEBHOOK_URL` - Optional reporting

**Voice/Coach-specific:**
- `DEEPGRAM_API_KEY` - Speech-to-text
- `ELEVENLABS_API_KEY` - Text-to-speech

**Web-specific:**
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Browser Supabase client
- `NEXT_PUBLIC_API_URL` - API base URL
- `NEXT_PUBLIC_VOICE_URL` - Voice WebSocket URL
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` - Analytics
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` - Push notification registration
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Sheets import

**Secrets location:**
- DigitalOcean App Platform secrets (production)
- `.env` files (local development, gitignored)
- `apps/web/.env.example` provides template for web env vars

---

*Integration audit: 2026-03-06*
