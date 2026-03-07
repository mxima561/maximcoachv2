# Codebase Concerns

**Analysis Date:** 2026-03-06

## Tech Debt

**Unauthenticated Conversation Token Endpoint:**
- Issue: The `/conversation-token` endpoint in `apps/api/src/routes/conversation-token.ts` has no authentication check. Anyone can request ElevenLabs signed URLs, consuming API credits.
- Files: `apps/api/src/routes/conversation-token.ts`
- Impact: Cost exposure from unauthorized usage; anyone who discovers the endpoint can start voice sessions without an account.
- Fix approach: Add `requireAuth()` call before generating the signed URL, matching the pattern in all other route files.

**Email Worker is a No-Op:**
- Issue: The email queue worker in `apps/api/src/lib/queues.ts` (line 177-183) only logs job data and does nothing. Two TODO comments in `apps/api/src/routes/billing.ts` (lines 418 and 455) reference sending email notifications for payment failures and downgrades, but no email sending logic exists anywhere in the codebase.
- Files: `apps/api/src/lib/queues.ts`, `apps/api/src/routes/billing.ts`
- Impact: Users receive no notification about payment failures, grace periods, or plan downgrades. Critical billing events go unnoticed.
- Fix approach: Integrate an email service (e.g., Resend, SendGrid) in the email worker. Wire up the two billing TODOs to enqueue email jobs.

**Badge Evaluation Worker is a Stub:**
- Issue: The `badge-evaluation` job handler in `apps/api/src/lib/queues.ts` (line 239-241) only logs and does nothing. The actual badge evaluation logic exists in the HTTP route at `apps/api/src/routes/gamification.ts` (line 266-391) but is not shared with the worker.
- Files: `apps/api/src/lib/queues.ts`, `apps/api/src/routes/gamification.ts`
- Impact: Background badge evaluation never fires; badges are only evaluated when the client explicitly calls the HTTP endpoint.
- Fix approach: Extract badge evaluation logic into a shared function and call it from both the worker and the route handler.

**Supabase Client Created Per-Request in Workers:**
- Issue: Workers in `apps/api/src/lib/queues.ts` create new Supabase clients via dynamic `import()` inside every job handler (lines 105-109, 144-149, 188-193, 393-398). This is inefficient and bypasses the centralized `createServiceClient()` from `apps/api/src/lib/supabase.ts`.
- Files: `apps/api/src/lib/queues.ts`
- Impact: Unnecessary overhead per job execution; inconsistent client creation pattern.
- Fix approach: Import `createServiceClient` at the top of the worker file and reuse it, matching the pattern used in all route files.

**Duplicate Route Aliases:**
- Issue: Multiple routes register both a primary path and an alias for "PRD compatibility":
  - `/api/scorecards/generate` and `/api/scorecard/generate` in `apps/api/src/routes/scorecard.ts`
  - `/create` and `/api/sessions/create` in `apps/api/src/routes/sessions.ts`
  - `/api/personas/generate` and `/api/persona/generate` in `apps/api/src/routes/persona.ts`
- Files: `apps/api/src/routes/scorecard.ts`, `apps/api/src/routes/sessions.ts`, `apps/api/src/routes/persona.ts`
- Impact: Maintenance burden; unclear which is canonical. Rate limiting may only cover one alias.
- Fix approach: Consolidate to a single route path per endpoint. If backward compatibility is needed, use a redirect or Fastify prefix.

**Module-Level Mutable State for ElevenLabs Conversation:**
- Issue: `apps/web/src/app/(app)/simulate/[sessionId]/page.tsx` uses a module-level `let activeConversation: Conversation | null = null;` (line 24). In React with strict mode or hot reloading, this can cause stale references and leaked WebSocket connections.
- Files: `apps/web/src/app/(app)/simulate/[sessionId]/page.tsx`
- Impact: Potential for orphaned voice sessions that continue consuming ElevenLabs credits.
- Fix approach: Move `activeConversation` into a `useRef` and handle cleanup in `useEffect` return.

**CRM Sync Iterates Contacts One-by-One:**
- Issue: Both `syncSalesforce` and `syncHubSpot` in `apps/api/src/lib/crm-sync.ts` loop through contacts and issue individual `select` + `insert/update` queries per contact (up to 500 for Salesforce, 100 for HubSpot).
- Files: `apps/api/src/lib/crm-sync.ts`
- Impact: O(n) database round-trips per sync. A Salesforce sync with 500 contacts issues ~1000 queries.
- Fix approach: Use Supabase `upsert()` with `onConflict: 'org_id,crm_id'` to batch the operation.

## Security Considerations

**CRM Tokens Stored as Plaintext:**
- Risk: The `integrations` table stores `access_token_encrypted` and `refresh_token_encrypted` as plain `text` columns (see `supabase/migrations/20260214000002_core_tables.sql` lines 192-193). Despite the column names suggesting encryption, no actual encryption (pgcrypto, Supabase Vault, or application-level) is applied.
- Files: `supabase/migrations/20260214000002_core_tables.sql`, `apps/api/src/lib/crm-sync.ts`, `apps/api/src/routes/crm-salesforce.ts`, `apps/api/src/routes/crm-hubspot.ts`
- Current mitigation: RLS policies restrict access to org members.
- Recommendations: Use Supabase Vault or application-level encryption (AES-256) for OAuth tokens. Column names imply encryption exists, which is misleading.

**Non-Cryptographic Rate Limit Key:**
- Risk: `apps/api/src/lib/rate-limit.ts` uses the last 16 characters of the JWT as the rate limit key (line 24). This is a weak fingerprint; token rotation or different tokens from the same user produce different keys, and token suffixes may collide across users.
- Files: `apps/api/src/lib/rate-limit.ts`
- Current mitigation: Fallback to IP-based limiting for unauthenticated requests.
- Recommendations: Decode the JWT to extract the `sub` (user ID) claim for rate limiting, or use a lightweight JWT decode without full verification since auth middleware handles that.

**Stripe Webhook Secret Uses Non-Null Assertion:**
- Risk: `process.env.STRIPE_WEBHOOK_SECRET!` in `apps/api/src/routes/billing.ts` (line 300) will cause a runtime error if the env var is missing, but silently proceeds without validation.
- Files: `apps/api/src/routes/billing.ts`
- Current mitigation: The billing routes skip registration if `STRIPE_SECRET_KEY` is missing, but `STRIPE_WEBHOOK_SECRET` is not checked.
- Recommendations: Validate `STRIPE_WEBHOOK_SECRET` at route registration time alongside `STRIPE_SECRET_KEY`.

**IP Address Stored in Trial Tracking:**
- Risk: IP addresses are stored in `trial_sessions` and `trial_events` tables for abuse prevention. This is PII under GDPR and similar regulations.
- Files: `apps/api/src/routes/sessions.ts`, `apps/web/src/app/(app)/simulations/new/page.tsx` (line 278 fetches IP from ipify)
- Current mitigation: None observed.
- Recommendations: Hash IP addresses before storage, or add a data retention policy to purge trial session records after a fixed period.

## Performance Bottlenecks

**Gamification Profile Endpoint — N+1 Queries:**
- Problem: `GET /api/gamification/profile` in `apps/api/src/routes/gamification.ts` makes 3 sequential database queries (user, rank, today's XP, recent XP) on every request.
- Files: `apps/api/src/routes/gamification.ts` (lines 65-116)
- Cause: No caching, no query batching, and the rank lookup could be computed in-memory from the RANKS constant already defined in the file.
- Improvement path: Remove the `ranks` table lookup since rank data is already hardcoded in `RANKS`. Use `Promise.all()` for the remaining queries. Consider short-lived caching (30-60s) for the profile data.

**Badge Evaluation — Unbounded Query Fan-Out:**
- Problem: `POST /api/gamification/evaluate-badges` issues 7+ database queries per call: user stats, earned badges, all badges, session count, best score, unique scenarios, H2H wins, challenge completions. Then loops over all unearned badges with individual inserts.
- Files: `apps/api/src/routes/gamification.ts` (lines 266-391)
- Cause: No caching of badge definitions; individual inserts per awarded badge.
- Improvement path: Cache badge definitions (they rarely change). Batch badge and XP inserts. Wrap in a database function to reduce round-trips.

**Leaderboard Refresh Every 15 Minutes:**
- Problem: Materialized view refresh runs every 15 minutes for 4 views. If data volume grows, these refreshes will lock the views.
- Files: `apps/api/src/lib/queues.ts` (lines 151-167, 477-481)
- Cause: `REFRESH MATERIALIZED VIEW` takes an exclusive lock by default.
- Improvement path: Use `REFRESH MATERIALIZED VIEW CONCURRENTLY` (requires a unique index on the view). Monitor refresh duration.

**Large Page Components:**
- Problem: Several page components are monolithic single-file components exceeding 400 lines:
  - `apps/web/src/app/(app)/simulations/new/page.tsx` (850 lines)
  - `apps/web/src/app/(app)/dashboard/page.tsx` (584 lines)
  - `apps/web/src/app/(app)/simulate/[sessionId]/page.tsx` (456 lines)
  - `apps/web/src/app/(app)/h2h/[matchId]/page.tsx` (432 lines)
- Files: Listed above
- Cause: All state, UI, and data fetching logic in a single component.
- Improvement path: Extract data-fetching hooks (e.g., `useDashboardStats`), break UI into sub-components, and colocate them in the route directory.

## Fragile Areas

**Scorecard Generation — Unvalidated AI JSON:**
- Files: `apps/api/src/routes/scorecard.ts` (lines 99-129)
- Why fragile: The scorecard endpoint asks GPT-4o to return JSON and parses it with `JSON.parse()`. If OpenAI returns markdown fences, extra text, or malformed JSON, the request fails with a 500. The persona route has a fence-stripping workaround (line 248-249) that the scorecard route lacks.
- Safe modification: Add the same markdown fence stripping logic. Consider using OpenAI's structured output / JSON mode.
- Test coverage: No test file exists for `scorecard.ts`.

**Streak Reset Worker — Timezone Edge Cases:**
- Files: `apps/api/src/lib/queues.ts` (lines 195-236)
- Why fragile: The streak reset logic runs hourly and compares dates using `toLocaleDateString("en-CA", { timeZone: tz })`. If a user's timezone is invalid or null, it defaults to "America/New_York". The date comparison `user.last_practice_date < userYesterday` is a string comparison that works for ISO dates but is brittle. Users near the international date line or with unusual timezones may see incorrect streak resets.
- Safe modification: Validate timezone values against IANA database. Consider moving this logic to a Postgres function that can handle timezone math natively.
- Test coverage: No tests for the streak reset worker.

**XP Award — Race Condition on total_xp:**
- Files: `apps/api/src/routes/gamification.ts` (lines 120-213)
- Why fragile: The XP award endpoint reads `user.total_xp`, adds the new amount, and writes back with `update({ total_xp: newTotalXp })`. If two XP awards fire concurrently (e.g., session complete + badge earned), one update will overwrite the other.
- Safe modification: Use a Postgres `UPDATE users SET total_xp = total_xp + $1` pattern or an RPC function with atomic increment. The same issue affects `current_streak` and `longest_streak`.
- Test coverage: `apps/api/src/routes/gamification.test.ts` exists but may not cover concurrent scenarios.

**Simulation Page — No Cleanup on Navigation:**
- Files: `apps/web/src/app/(app)/simulate/[sessionId]/page.tsx`
- Why fragile: The `useEffect` that starts the conversation (lines 141-222) has no cleanup return. If the user navigates away via browser back button (not the "End Session" button), the ElevenLabs session remains active. The `handleEndSession` function is only called from the dialog button.
- Safe modification: Add `return () => { activeConversation?.endSession(); }` to the useEffect. Move activeConversation to a ref.
- Test coverage: No unit tests for the simulation page.

## Test Coverage Gaps

**Route Handler Tests — Minimal Coverage:**
- What's not tested: Only 4 route files have tests out of 16 route files total:
  - `apps/api/src/__tests__/billing.test.ts`
  - `apps/api/src/__tests__/rate-limit.test.ts`
  - `apps/api/src/lib/http-errors.test.ts`
  - `apps/api/src/routes/gamification.test.ts`
- Files: Missing tests for `persona.ts`, `scorecard.ts`, `sessions.ts`, `challenges.ts`, `crm-salesforce.ts`, `crm-hubspot.ts`, `drills.ts`, `h2h.ts`, `clips.ts`, `transcripts.ts`, `reports.ts`, `notifications.ts`
- Risk: Core business logic (persona generation, session creation, CRM sync) has no automated test coverage. Regressions will go unnoticed.
- Priority: High

**Frontend Tests — None:**
- What's not tested: Zero tests exist for any React component or page in `apps/web/`.
- Files: All of `apps/web/src/`
- Risk: UI regressions, broken forms, and state management bugs are only caught manually.
- Priority: Medium (E2E tests in `e2e/simulation-flow.spec.ts` and `apps/web/e2e/staging-critical-flows.spec.ts` provide some coverage)

**Queue Worker Tests — None:**
- What's not tested: No tests for any BullMQ worker handler (CRM sync, streak reset, daily plan generation, transcript analysis, audio compression).
- Files: `apps/api/src/lib/queues.ts`
- Risk: Worker logic (548 lines) is complex and includes database mutations, external API calls, and AI analysis. Bugs here silently corrupt data.
- Priority: High

**CRM Sync Integration — No Tests:**
- What's not tested: `apps/api/src/lib/crm-sync.ts` (305 lines) handles Salesforce and HubSpot OAuth token refresh, contact syncing, and error handling with no test coverage.
- Files: `apps/api/src/lib/crm-sync.ts`
- Risk: Token refresh failures, contact deduplication bugs, and API response handling issues go undetected.
- Priority: High

## Dependencies at Risk

**Sentry Transaction API — Deprecated Pattern:**
- Risk: `apps/api/src/index.ts` (lines 86-114) uses `Sentry.startTransaction()` which is from the legacy performance API. The code casts Sentry to extract `startTransaction` with an unsafe type assertion. This API has been deprecated in favor of `Sentry.startSpan()`.
- Impact: Performance tracing may silently stop working on Sentry SDK upgrades.
- Migration plan: Replace `startTransaction` / `finish()` with `Sentry.startSpan()` / `Sentry.continueTrace()` from the current Sentry Node SDK.

**`catch (err: any)` Usage in Frontend:**
- Risk: Three locations in the frontend use `catch (err: any)` which bypasses TypeScript's error checking:
  - `apps/web/src/app/(app)/simulate/[sessionId]/page.tsx` (lines 132, 213)
  - `apps/web/src/app/(app)/simulations/new/page.tsx` (line 359)
- Impact: Accessing `err.message` on non-Error objects will throw at runtime.
- Migration plan: Use `catch (err: unknown)` and check `err instanceof Error` before accessing properties, matching the pattern already used in `apps/api/src/lib/push.ts`.

## Missing Critical Features

**No Graceful Shutdown for Workers:**
- Problem: `startWorkers()` in `apps/api/src/lib/queues.ts` creates workers but never provides a shutdown mechanism. The workers are started inline during server boot and there is no `SIGTERM` handler to drain jobs.
- Blocks: Safe deployments in production; active jobs may be terminated mid-execution during deploys.

**No Database Connection Pooling Strategy:**
- Problem: Every route handler calls `createServiceClient()` which creates a fresh `@supabase/supabase-js` client. While Supabase.js internally pools HTTP connections, there is no explicit connection management or health checking.
- Files: `apps/api/src/lib/supabase.ts`
- Blocks: At scale, simultaneous requests may exhaust Supabase connection limits.

---

*Concerns audit: 2026-03-06*

