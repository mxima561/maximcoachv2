# Coding Conventions

**Analysis Date:** 2026-03-06

## Naming Patterns

**Files:**
- Use kebab-case for all source files: `http-errors.ts`, `cost-tracker.ts`, `adaptive-difficulty.ts`
- Route files named after the resource: `gamification.ts`, `sessions.ts`, `billing.ts`
- React components use kebab-case files: `app-sidebar.tsx`, `page-transition.tsx`, `drill-card.tsx`
- UI components from shadcn use kebab-case: `button.tsx`, `data-table.tsx`, `dropdown-menu.tsx`
- Hooks prefixed with `use-`: `use-mobile.ts`, `use-push-notifications.ts`, `use-trial-status.ts`
- Test files use `.test.ts` suffix (not `.spec.ts`): `http-errors.test.ts`, `billing.test.ts`
- Exception: E2E tests use `.spec.ts` suffix: `simulation-flow.spec.ts`

**Functions:**
- Use camelCase for all functions: `createServiceClient()`, `requireAuth()`, `sendValidationError()`
- Route registrars use `{resource}Routes` pattern: `gamificationRoutes`, `sessionRoutes`, `billingRoutes`
- Helper/factory functions: `createMockReply()`, `chainResolving()`, `checkoutPayload()`
- React components use PascalCase: `XpBar`, `StreakCounter`, `RankBadge`, `BadgeDisplay`

**Variables:**
- Use camelCase for local variables: `todayTotal`, `newTotalXp`, `rankProgress`
- Use UPPER_SNAKE_CASE for module-level constants: `XP_REWARDS`, `RANKS`, `TEST_ORG_ID`
- Use snake_case for database column names and Zod schema fields: `total_xp`, `current_streak`, `stripe_customer_id`
- Environment variables use UPPER_SNAKE_CASE: `SUPABASE_URL`, `STRIPE_SECRET_KEY`, `WEB_ORIGIN`

**Types:**
- Use PascalCase for types and interfaces: `AuthContext`, `ApiErrorResponse`, `FieldError`
- Zod schemas use PascalCase with `Schema` suffix: `OrganizationSchema`, `UserSchema`, `SessionSchema`, `AwardXpSchema`
- Inferred types from Zod use PascalCase without suffix: `export type Organization = z.infer<typeof OrganizationSchema>`
- Constants arrays use UPPER_SNAKE_CASE with `as const`: `ROLES`, `SCENARIO_TYPES`, `PLANS`
- Derived types from constants: `export type Role = (typeof ROLES)[number]`

## Code Style

**Formatting:**
- No Prettier config detected; formatting is manual/editor-based
- Double quotes for strings (consistent across API and shared packages)
- Semicolons used consistently
- 2-space indentation (TypeScript files)
- Trailing commas in multi-line structures

**Linting:**
- Web app: ESLint 9 flat config with `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` at `apps/web/eslint.config.mjs`
- Disabled rules in web: `react-hooks/purity`, `react-hooks/set-state-in-effect`, `react-hooks/immutability`, `@typescript-eslint/no-explicit-any`
- API: No linter configured (`"lint": "echo 'no linter configured yet'"` in `apps/api/package.json`)
- TypeScript: Strict mode enabled via `tsconfig.base.json` with `"strict": true`

## Import Organization

**Order:**
1. Node built-ins or environment setup (`"dotenv/config"`)
2. External packages (`fastify`, `zod`, `@supabase/supabase-js`, `@sentry/node`)
3. Workspace packages (`@maxima/auth`, `@maxima/shared`)
4. Local imports with relative paths (`../lib/supabase.js`, `./http-errors.js`)

**Path Aliases:**
- Web app uses `@/` alias mapped to `src/`: `@/components/ui/button`, `@/lib/supabase/client`, `@/lib/posthog`
- API uses relative paths with `.js` extensions (ESM): `../lib/supabase.js`, `./http-errors.js`
- Shared packages import without extensions: `from "../schemas"`, `from "../constants"`

**ESM Convention:**
- All packages use `"type": "module"` in `package.json`
- API imports require `.js` extension on relative imports (Node ESM resolution)
- Shared/auth packages omit extensions (resolved by bundler)

## Error Handling

**API Error Response Pattern:**
- Use structured error responses with `code` and `message` fields via helpers in `apps/api/src/lib/http-errors.ts`
- Standard helpers: `sendValidationError(reply, zodError)`, `sendUnauthorized(reply, msg)`, `sendForbidden(reply, msg)`
- Response shape satisfies `ApiErrorResponse`: `{ code: string, message: string, fieldErrors?: FieldError[] }`

```typescript
// Validation errors (400)
const parsed = AwardXpSchema.safeParse(request.body);
if (!parsed.success) return sendValidationError(reply, parsed.error);

// Auth errors (401)
sendUnauthorized(reply, "Missing bearer token");

// Permission errors (403)
sendForbidden(reply, "Organization access denied");

// Not found (404)
return reply.status(404).send({ error: "User not found" });

// Server errors (500)
return reply.status(500).send({ error: error.message });
```

**Auth Pattern:**
- `requireAuth()` returns `AuthContext | null` -- returns `null` and sends 401 response when auth fails
- Callers must guard: `const auth = await requireAuth(request, reply); if (!auth) return;`
- Same pattern for `requireOrgMembership()`: returns `null` + sends 403 on failure

**Custom Error Classes:**
- `AuthError` class in `packages/auth/src/index.ts` with `code` property (`"expired"`, `"invalid"`, `"malformed"`, `"missing_claims"`)

**Sentry Integration:**
- Global error handler in `apps/api/src/index.ts` captures all unhandled errors
- Tags errors with route, method, status code
- Filters health check errors from reporting
- 4xx errors logged as `"warning"`, 5xx as `"error"`

## Logging

**Framework:** Pino (via Fastify's built-in logger)

**Patterns:**
- Use `request.log.error(error)` for request-scoped logging in route handlers
- Use `app.log.error(err)` for application-level errors
- Dev mode uses `pino-pretty` transport; production uses raw JSON
- Log validation failures with context: `request.log.error({ body, issues }, "Session creation validation failed")`

## Comments

**When to Comment:**
- Section headers use decorative comment blocks: `// ── Schemas ──────────────────────`
- Inline comments for business logic: `// Streak broken — check for comeback badge`
- Route comments include HTTP method + path: `// GET /api/gamification/profile — user's XP, streak, rank, recent XP`

**JSDoc/TSDoc:**
- Not used. No JSDoc annotations observed.

## Function Design

**Size:** Route handler functions are long (50-100+ lines) with inline business logic. No service layer extraction.

**Parameters:**
- Fastify route handlers take `(request, reply)` and return via `reply.send()` or `reply.status().send()`
- Typed route generics: `app.post<{ Body: z.infer<typeof Schema> }>("/path", handler)`
- Auth functions accept `(request, reply)` and handle response internally

**Return Values:**
- Route handlers return `reply.send(data)` for success
- Route handlers return `reply.status(code).send({ error })` for errors
- Auth guard functions return `null` on failure (after sending response) or data on success

## Module Design

**Exports:**
- Route files export a single async function: `export async function gamificationRoutes(app: FastifyInstance)`
- Library modules export individual functions: `export function createServiceClient()`, `export function sendValidationError()`
- Shared package exports types + schemas from dedicated files
- Constants exported as `as const` arrays with corresponding types

**Barrel Files:**
- Shared package uses barrel export in `packages/shared/src/index.ts`
- No barrel files in API routes or lib

**Route Registration Pattern:**
```typescript
// Each route file exports a Fastify plugin function
export async function gamificationRoutes(app: FastifyInstance) {
  const supabase = createServiceClient();  // One client per plugin

  app.get("/api/gamification/profile", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    // ... handler logic
  });
}

// Registered in apps/api/src/index.ts
await app.register(gamificationRoutes);
```

**Validation Pattern:**
- Define Zod schemas at module scope above route handlers
- Parse with `safeParse()` at the start of each handler
- Return early with `sendValidationError()` on failure

```typescript
const AwardXpSchema = z.object({
  event_type: z.enum(["session_complete", "drill_complete"]),
  source_id: z.string().uuid().optional(),
});

// In handler:
const parsed = AwardXpSchema.safeParse(request.body);
if (!parsed.success) return sendValidationError(reply, parsed.error);
const { event_type, source_id } = parsed.data;
```

**React Component Pattern:**
- All pages use `"use client"` directive
- Components use function declarations (not arrow functions for exports)
- State management via `useState`/`useEffect` + direct Supabase client calls
- React Query (`@tanstack/react-query`) configured in providers but direct fetch pattern is common
- UI components from shadcn use `cva` (class-variance-authority) + `cn()` utility

**Supabase Client Pattern (Web):**
- Three client files in `apps/web/src/lib/supabase/`: `client.ts`, `server.ts`, `service.ts`
- Import client-side: `import { createClient } from "@/lib/supabase/client"`

**Database Naming:**
- Tables: snake_case plural (`organizations`, `users`, `sessions`, `xp_events`, `user_badges`)
- Columns: snake_case (`total_xp`, `current_streak`, `stripe_customer_id`, `last_practice_date`)
- Migrations: timestamped with description (`20260304000001_gamification.sql`)

---

*Convention analysis: 2026-03-06*
