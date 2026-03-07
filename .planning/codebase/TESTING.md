# Testing Patterns

**Analysis Date:** 2026-03-06

## Test Framework

**Runner:**
- Vitest 4.0.18 for unit/integration tests
- Playwright 1.58.2 for E2E tests
- pgTAP for database RLS policy tests

**Config files:**
- Root: `vitest.config.ts` (aggregates all workspace tests)
- `apps/api/vitest.config.ts` (app-specific)
- `apps/coach/vitest.config.ts` (app-specific)
- `playwright.config.ts` (E2E config)

**Assertion Library:**
- Vitest built-in `expect` (globals enabled)

**Run Commands:**
```bash
pnpm test                # Run all vitest tests (root)
pnpm test:watch          # Vitest watch mode (root)
pnpm test:coverage       # Vitest with v8 coverage (root)
pnpm test:e2e            # Playwright E2E tests (root)
supabase test db         # pgTAP RLS policy tests
```

## Test File Organization

**Location:**
- Mixed pattern: both co-located and `__tests__/` directories
- Co-located: `apps/api/src/lib/http-errors.test.ts` (next to `http-errors.ts`)
- Co-located: `apps/api/src/routes/gamification.test.ts` (next to `gamification.ts`)
- Separate directory: `apps/api/src/__tests__/billing.test.ts`, `apps/api/src/__tests__/rate-limit.test.ts`
- Separate directory: `packages/voice-core/src/__tests__/cost-tracker.test.ts`, `packages/voice-core/src/__tests__/state-machine.test.ts`
- Separate directory: `packages/auth/src/__tests__/auth.test.ts`
- Separate directory: `packages/shared/src/__tests__/schemas.test.ts`

**Naming:**
- Unit/integration tests: `*.test.ts`
- E2E tests: `*.spec.ts`

**Include patterns (from root vitest config):**
```
packages/*/src/**/*.test.ts
apps/*/src/**/*.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

describe("Feature/Component Name", () => {
  // Setup at top
  let app: FastifyInstance;

  beforeAll(async () => {
    // One-time setup (create Fastify app, register routes)
  });

  afterAll(async () => {
    // Teardown (close app)
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset state per test
  });

  it("describes expected behavior in plain English", () => {
    // Arrange → Act → Assert
  });
});
```

**Patterns:**
- `describe` blocks group by feature, endpoint, or logical unit
- Nested `describe` blocks for endpoint grouping: `describe("POST /api/billing/checkout", () => { ... })`
- `it` descriptions start with verbs: "should return", "creates", "rejects", "allows", "returns"
- `beforeAll`/`afterAll` for Fastify app lifecycle (create once, close once)
- `beforeEach` for mock reset with `vi.clearAllMocks()`

## Mocking

**Framework:** Vitest built-in `vi.mock()`, `vi.fn()`, `vi.hoisted()`

**Module Mocking Pattern (API tests):**
```typescript
// Hoist env vars before module evaluation
vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_SOLO_PRICE_ID = "price_solo_test";
});

// Mock external SDKs with class replacement
vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = { sessions: { create: mockStripeCheckoutCreate } };
    webhooks = { constructEvent: mockStripeWebhooksConstructEvent };
  },
}));

// Mock internal modules
vi.mock("../lib/supabase.js", () => ({
  createServiceClient: () => supabaseProxy,
}));

vi.mock("../lib/auth.js", () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: "user-123", email: "test@example.com" }),
  requireOrgMembership: vi.fn().mockResolvedValue({ role: "admin" }),
}));
```

**Supabase Mock Pattern (chainable builder):**
```typescript
// Reusable chainable mock that simulates Supabase query builder
function chainResolving(data: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "gte", "limit", "update", "insert", "delete"];
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({ data, error: null });
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  return chain;
}

// Proxy pattern for swappable per-test handlers
let currentFromHandler: (table: string) => Record<string, unknown>;
const supabaseProxy = {
  from: (...args: unknown[]) => currentFromHandler(args[0] as string),
};

function setSupabase(handlers: Record<string, unknown>) {
  currentFromHandler = (table: string) => {
    if (handlers[table]) return handlers[table] as Record<string, unknown>;
    return chainResolving(null);
  };
}
```

**Lightweight Mocks (no external dependencies):**
```typescript
// Simple mock objects for unit tests (no vi.mock needed)
function createMockReply() {
  let statusCode = 200;
  let payload: unknown = null;
  const reply = {
    status(code: number) { statusCode = code; return this; },
    send(body: unknown) { payload = body; return this; },
    get statusCode() { return statusCode; },
    get payload() { return payload; },
  };
  return reply;
}
```

**What to Mock:**
- External service SDKs (Stripe, Supabase client)
- Auth middleware (`requireAuth`, `requireOrgMembership`)
- Environment variables (via `vi.hoisted()`)

**What NOT to Mock:**
- Pure business logic (rank calculations, streak logic, schema validation)
- Zod schemas -- test by calling `safeParse()` directly
- State machines and cost trackers -- test the real implementation

## Fixtures and Factories

**Test Data:**
```typescript
// UUIDs as module-level constants
const TEST_ORG_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

// Builder/helper functions for request payloads
function checkoutPayload(plan: string) {
  return {
    org_id: TEST_ORG_ID,
    plan,
    success_url: "https://app.example.com/success",
    cancel_url: "https://app.example.com/cancel",
  };
}

function webhookRequest(event: unknown) {
  return {
    method: "POST" as const,
    url: "/api/billing/webhook",
    headers: { "stripe-signature": "t=123,v1=abc", "content-type": "application/json" },
    payload: JSON.stringify(event),
  };
}

// Factory for message arrays (voice-core tests)
function makeMessages(count: number, startMs = now - 60_000): ConversationMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `message ${i}`,
    timestamp: startMs + i * 1000,
  }));
}
```

**Location:**
- Fixtures are inline within test files (no shared fixtures directory)
- RLS tests use SQL fixtures in `supabase/tests/rls_policies.test.sql`
- E2E tests use env vars for credentials: `process.env.E2E_TEST_EMAIL`

## Coverage

**Requirements:** No enforced threshold. Coverage available but not gated.

**Configuration (from root `vitest.config.ts`):**
```typescript
coverage: {
  provider: "v8",
  include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
  exclude: ["**/*.test.ts", "**/*.d.ts", "**/index.ts"],
},
```

**View Coverage:**
```bash
pnpm test:coverage       # Generates v8 coverage report
```

## Test Types

**Unit Tests:**
- Pure logic testing without HTTP or database
- Files: `packages/voice-core/src/__tests__/cost-tracker.test.ts`, `packages/voice-core/src/__tests__/state-machine.test.ts`, `packages/voice-core/src/__tests__/llm.test.ts`
- Files: `packages/shared/src/__tests__/schemas.test.ts`, `packages/auth/src/__tests__/auth.test.ts`
- Files: `apps/api/src/lib/http-errors.test.ts`, `apps/api/src/routes/gamification.test.ts`
- Pattern: import function/class, call it, assert result

**Integration Tests (Fastify inject):**
- Use `app.inject()` to test full request/response cycle through Fastify
- Files: `apps/api/src/__tests__/billing.test.ts`, `apps/api/src/__tests__/rate-limit.test.ts`
- Pattern: create Fastify instance, register routes with mocked dependencies, inject HTTP requests

```typescript
const app = Fastify({ logger: false });
await app.register(billingRoutes);
await app.ready();

const res = await app.inject({
  method: "POST",
  url: "/api/billing/checkout",
  headers: { authorization: "Bearer test-token" },
  payload: checkoutPayload("starter"),
});
expect(res.statusCode).toBe(200);
```

**Database Tests (pgTAP):**
- RLS policy verification in `supabase/tests/rls_policies.test.sql`
- Creates fixture data (2 orgs, 6 users with different roles)
- Tests row-level security isolation between organizations
- Run with `supabase test db`

**E2E Tests (Playwright):**
- Full user journey testing in `e2e/simulation-flow.spec.ts`
- Config: single worker, sequential execution, Chromium only
- Mocks external APIs via Playwright route interception (`page.route()`)
- Tests login -> create simulation -> run simulation -> view scorecard
- Web server started automatically via Playwright config

```typescript
// E2E external API mocking
await page.route("**/api.openai.com/**", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({...}) })
);
```

## Common Patterns

**Async Testing:**
```typescript
// Async route handler tests with inject
it("creates a checkout session", async () => {
  mockStripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/..." });
  const res = await app.inject({ method: "POST", url: "/api/billing/checkout", ... });
  expect(res.statusCode).toBe(200);
});

// Async error testing
it("throws AuthError for expired token", async () => {
  await expect(verifyToken(token)).rejects.toThrow(AuthError);
  await expect(verifyToken(token)).rejects.toMatchObject({ code: "expired" });
});
```

**Error Testing:**
```typescript
// Validation rejection
it("rejects invalid plan names", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/billing/checkout",
    payload: checkoutPayload("nonexistent"),
  });
  expect(res.statusCode).toBe(400);
});

// Schema validation testing
it("rejects an organization with invalid plan", () => {
  const result = OrganizationSchema.safeParse({ ...valid, plan: "invalid_plan" });
  expect(result.success).toBe(false);
});
```

**State Machine Testing:**
```typescript
it("allows valid transitions", () => {
  const sm = new VoiceStateMachine();
  expect(sm.transition("LISTENING")).toBe(true);
  expect(sm.state).toBe("LISTENING");
});

it("rejects invalid transitions", () => {
  const sm = new VoiceStateMachine();
  expect(sm.transition("SPEAKING")).toBe(false);
  expect(sm.state).toBe("IDLE");  // unchanged
});
```

**Self-Contained Logic Tests (extracted for testability):**
```typescript
// In gamification.test.ts, business logic is duplicated from the route
// file and tested independently (no HTTP layer needed)
const RANKS = [...];
function getRankForXp(xp: number) { ... }

describe("Rank Progression", () => {
  it("should return Rookie for 0 XP", () => {
    expect(getRankForXp(0).name).toBe("Rookie");
  });
});
```

## Test Inventory

| Location | Test File | Type | What it Tests |
|----------|-----------|------|---------------|
| `apps/api/src/__tests__/billing.test.ts` | Integration | Stripe checkout, webhooks, usage, feature checks |
| `apps/api/src/__tests__/rate-limit.test.ts` | Integration | Rate limiting with Fastify |
| `apps/api/src/lib/http-errors.test.ts` | Unit | Error response helpers |
| `apps/api/src/routes/gamification.test.ts` | Unit | Rank progression, XP, streaks, badges |
| `packages/shared/src/__tests__/schemas.test.ts` | Unit | Zod schema validation, `canAccess()` |
| `packages/auth/src/__tests__/auth.test.ts` | Unit | JWT verification, token extraction |
| `packages/voice-core/src/__tests__/cost-tracker.test.ts` | Unit | Cost tracking accumulation |
| `packages/voice-core/src/__tests__/state-machine.test.ts` | Unit | Voice state machine transitions |
| `packages/voice-core/src/__tests__/llm.test.ts` | Unit | Context window filtering |
| `e2e/simulation-flow.spec.ts` | E2E | Full simulation user journey |
| `supabase/tests/rls_policies.test.sql` | Database | RLS policy isolation |

---

*Testing analysis: 2026-03-06*

# Testing Patterns

**Analysis Date:** 2026-03-06

## Test Framework

**Runner:**
- Vitest 4.0.18 for unit/integration tests
- Playwright 1.58.2 for E2E tests
- pgTAP for database RLS policy tests

**Config files:**
- Root: `vitest.config.ts` (aggregates all workspace tests)
- `apps/api/vitest.config.ts` (app-specific)
- `apps/coach/vitest.config.ts` (app-specific)
- `playwright.config.ts` (E2E config)

**Assertion Library:**
- Vitest built-in `expect` (globals enabled)

**Run Commands:**
```bash
pnpm test                # Run all vitest tests (root)
pnpm test:watch          # Vitest watch mode (root)
pnpm test:coverage       # Vitest with v8 coverage (root)
pnpm test:e2e            # Playwright E2E tests (root)
supabase test db         # pgTAP RLS policy tests
```

## Test File Organization

**Location:**
- Mixed pattern: both co-located and `__tests__/` directories
- Co-located: `apps/api/src/lib/http-errors.test.ts` (next to `http-errors.ts`)
- Co-located: `apps/api/src/routes/gamification.test.ts` (next to `gamification.ts`)
- Separate directory: `apps/api/src/__tests__/billing.test.ts`, `apps/api/src/__tests__/rate-limit.test.ts`
- Separate directory: `packages/voice-core/src/__tests__/cost-tracker.test.ts`, `packages/voice-core/src/__tests__/state-machine.test.ts`
- Separate directory: `packages/auth/src/__tests__/auth.test.ts`
- Separate directory: `packages/shared/src/__tests__/schemas.test.ts`

**Naming:**
- Unit/integration tests: `*.test.ts`
- E2E tests: `*.spec.ts`

**Include patterns (from root `vitest.config.ts`):**
```
packages/*/src/**/*.test.ts
apps/*/src/**/*.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

describe("Feature/Component Name", () => {
  // Setup at top
  let app: FastifyInstance;

  beforeAll(async () => {
    // One-time setup (create Fastify app, register routes)
  });

  afterAll(async () => {
    // Teardown (close app)
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset state per test
  });

  it("describes expected behavior in plain English", () => {
    // Arrange - Act - Assert
  });
});
```

**Patterns:**
- `describe` blocks group by feature, endpoint, or logical unit
- Nested `describe` blocks for endpoint grouping: `describe("POST /api/billing/checkout", () => { ... })`
- `it` descriptions start with verbs: "should return", "creates", "rejects", "allows", "returns"
- `beforeAll`/`afterAll` for Fastify app lifecycle (create once, close once)
- `beforeEach` for mock reset with `vi.clearAllMocks()`

## Mocking

**Framework:** Vitest built-in `vi.mock()`, `vi.fn()`, `vi.hoisted()`

**Module Mocking Pattern (API tests):**
```typescript
// Hoist env vars before module evaluation
vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_SOLO_PRICE_ID = "price_solo_test";
});

// Mock external SDKs with class replacement
vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = { sessions: { create: mockStripeCheckoutCreate } };
    webhooks = { constructEvent: mockStripeWebhooksConstructEvent };
  },
}));

// Mock internal modules
vi.mock("../lib/supabase.js", () => ({
  createServiceClient: () => supabaseProxy,
}));

vi.mock("../lib/auth.js", () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: "user-123", email: "test@example.com" }),
  requireOrgMembership: vi.fn().mockResolvedValue({ role: "admin" }),
}));
```

**Supabase Mock Pattern (chainable builder):**
```typescript
// Reusable chainable mock that simulates Supabase query builder
function chainResolving(data: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "gte", "limit", "update", "insert", "delete"];
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({ data, error: null });
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  return chain;
}

// Proxy pattern for swappable per-test handlers
let currentFromHandler: (table: string) => Record<string, unknown>;
const supabaseProxy = {
  from: (...args: unknown[]) => currentFromHandler(args[0] as string),
};

function setSupabase(handlers: Record<string, unknown>) {
  currentFromHandler = (table: string) => {
    if (handlers[table]) return handlers[table] as Record<string, unknown>;
    return chainResolving(null);
  };
}
```

**Lightweight Mocks (no external dependencies):**
```typescript
// Simple mock objects for unit tests (no vi.mock needed)
function createMockReply() {
  let statusCode = 200;
  let payload: unknown = null;
  const reply = {
    status(code: number) { statusCode = code; return this; },
    send(body: unknown) { payload = body; return this; },
    get statusCode() { return statusCode; },
    get payload() { return payload; },
  };
  return reply;
}
```

**What to Mock:**
- External service SDKs (Stripe, Supabase client)
- Auth middleware (`requireAuth`, `requireOrgMembership`)
- Environment variables (via `vi.hoisted()`)

**What NOT to Mock:**
- Pure business logic (rank calculations, streak logic, schema validation)
- Zod schemas -- test by calling `safeParse()` directly
- State machines and cost trackers -- test the real implementation

## Fixtures and Factories

**Test Data:**
```typescript
// UUIDs as module-level constants
const TEST_ORG_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

// Builder/helper functions for request payloads
function checkoutPayload(plan: string) {
  return {
    org_id: TEST_ORG_ID,
    plan,
    success_url: "https://app.example.com/success",
    cancel_url: "https://app.example.com/cancel",
  };
}

function webhookRequest(event: unknown) {
  return {
    method: "POST" as const,
    url: "/api/billing/webhook",
    headers: { "stripe-signature": "t=123,v1=abc", "content-type": "application/json" },
    payload: JSON.stringify(event),
  };
}

// Factory for message arrays (voice-core tests)
function makeMessages(count: number, startMs = now - 60_000): ConversationMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `message ${i}`,
    timestamp: startMs + i * 1000,
  }));
}
```

**Location:**
- Fixtures are inline within test files (no shared fixtures directory)
- RLS tests use SQL fixtures in `supabase/tests/rls_policies.test.sql`
- E2E tests use env vars for credentials: `process.env.E2E_TEST_EMAIL`

## Coverage

**Requirements:** No enforced threshold. Coverage available but not gated.

**Configuration (from root `vitest.config.ts`):**
```typescript
coverage: {
  provider: "v8",
  include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
  exclude: ["**/*.test.ts", "**/*.d.ts", "**/index.ts"],
},
```

**View Coverage:**
```bash
pnpm test:coverage       # Generates v8 coverage report
```

## Test Types

**Unit Tests:**
- Pure logic testing without HTTP or database
- Files: `packages/voice-core/src/__tests__/cost-tracker.test.ts`, `packages/voice-core/src/__tests__/state-machine.test.ts`, `packages/voice-core/src/__tests__/llm.test.ts`
- Files: `packages/shared/src/__tests__/schemas.test.ts`, `packages/auth/src/__tests__/auth.test.ts`
- Files: `apps/api/src/lib/http-errors.test.ts`, `apps/api/src/routes/gamification.test.ts`
- Pattern: import function/class, call it, assert result

**Integration Tests (Fastify inject):**
- Use `app.inject()` to test full request/response cycle through Fastify
- Files: `apps/api/src/__tests__/billing.test.ts`, `apps/api/src/__tests__/rate-limit.test.ts`
- Pattern: create Fastify instance, register routes with mocked dependencies, inject HTTP requests

```typescript
const app = Fastify({ logger: false });
await app.register(billingRoutes);
await app.ready();

const res = await app.inject({
  method: "POST",
  url: "/api/billing/checkout",
  headers: { authorization: "Bearer test-token" },
  payload: checkoutPayload("starter"),
});
expect(res.statusCode).toBe(200);
```

**Database Tests (pgTAP):**
- RLS policy verification in `supabase/tests/rls_policies.test.sql`
- Creates fixture data (2 orgs, 6 users with different roles)
- Tests row-level security isolation between organizations
- Run with `supabase test db`

**E2E Tests (Playwright):**
- Full user journey testing in `e2e/simulation-flow.spec.ts`
- Config: single worker, sequential execution, Chromium only
- Mocks external APIs via Playwright route interception (`page.route()`)
- Tests login -> create simulation -> run simulation -> view scorecard
- Web server started automatically via Playwright config

```typescript
// E2E external API mocking
await page.route("**/api.openai.com/**", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({...}) })
);
```

## Common Patterns

**Async Testing:**
```typescript
// Async route handler tests with inject
it("creates a checkout session", async () => {
  mockStripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/..." });
  const res = await app.inject({ method: "POST", url: "/api/billing/checkout", ... });
  expect(res.statusCode).toBe(200);
});

// Async error testing
it("throws AuthError for expired token", async () => {
  await expect(verifyToken(token)).rejects.toThrow(AuthError);
  await expect(verifyToken(token)).rejects.toMatchObject({ code: "expired" });
});
```

**Error Testing:**
```typescript
// Validation rejection
it("rejects invalid plan names", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/billing/checkout",
    payload: checkoutPayload("nonexistent"),
  });
  expect(res.statusCode).toBe(400);
});

// Schema validation testing
it("rejects an organization with invalid plan", () => {
  const result = OrganizationSchema.safeParse({ ...valid, plan: "invalid_plan" });
  expect(result.success).toBe(false);
});
```

**State Machine Testing:**
```typescript
it("allows valid transitions", () => {
  const sm = new VoiceStateMachine();
  expect(sm.transition("LISTENING")).toBe(true);
  expect(sm.state).toBe("LISTENING");
});

it("rejects invalid transitions", () => {
  const sm = new VoiceStateMachine();
  expect(sm.transition("SPEAKING")).toBe(false);
  expect(sm.state).toBe("IDLE");  // unchanged
});
```

**Self-Contained Logic Tests (extracted for testability):**
```typescript
// In gamification.test.ts, business logic is duplicated from the route
// file and tested independently (no HTTP layer needed)
const RANKS = [...];
function getRankForXp(xp: number) { ... }

describe("Rank Progression", () => {
  it("should return Rookie for 0 XP", () => {
    expect(getRankForXp(0).name).toBe("Rookie");
  });
});
```

## Test Inventory

| Location | Type | What it Tests |
|----------|------|---------------|
| `apps/api/src/__tests__/billing.test.ts` | Integration | Stripe checkout, webhooks, usage, feature checks |
| `apps/api/src/__tests__/rate-limit.test.ts` | Integration | Rate limiting with Fastify |
| `apps/api/src/lib/http-errors.test.ts` | Unit | Error response helpers |
| `apps/api/src/routes/gamification.test.ts` | Unit | Rank progression, XP, streaks, badges |
| `packages/shared/src/__tests__/schemas.test.ts` | Unit | Zod schema validation, `canAccess()` |
| `packages/auth/src/__tests__/auth.test.ts` | Unit | JWT verification, token extraction |
| `packages/voice-core/src/__tests__/cost-tracker.test.ts` | Unit | Cost tracking accumulation |
| `packages/voice-core/src/__tests__/state-machine.test.ts` | Unit | Voice state machine transitions |
| `packages/voice-core/src/__tests__/llm.test.ts` | Unit | Context window filtering |
| `e2e/simulation-flow.spec.ts` | E2E | Full simulation user journey |
| `supabase/tests/rls_policies.test.sql` | Database | RLS policy isolation |

---

*Testing analysis: 2026-03-06*

# Testing Patterns

**Analysis Date:** 2026-03-06

## Test Framework

**Runner:**
- Vitest 4.0.18 for unit/integration tests
- Playwright 1.58.2 for E2E tests
- pgTAP for database RLS policy tests

**Config files:**
- Root: `vitest.config.ts` (aggregates all workspace tests)
- `apps/api/vitest.config.ts` (app-specific)
- `apps/coach/vitest.config.ts` (app-specific)
- `playwright.config.ts` (E2E config)

**Assertion Library:**
- Vitest built-in `expect` (globals enabled)

**Run Commands:**
```bash
pnpm test                # Run all vitest tests (root)
pnpm test:watch          # Vitest watch mode (root)
pnpm test:coverage       # Vitest with v8 coverage (root)
pnpm test:e2e            # Playwright E2E tests (root)
supabase test db         # pgTAP RLS policy tests
```

## Test File Organization

**Location:**
- Mixed pattern: both co-located and `__tests__/` directories
- Co-located: `apps/api/src/lib/http-errors.test.ts` (next to `http-errors.ts`)
- Co-located: `apps/api/src/routes/gamification.test.ts` (next to `gamification.ts`)
- Separate directory: `apps/api/src/__tests__/billing.test.ts`, `apps/api/src/__tests__/rate-limit.test.ts`
- Separate directory: `packages/voice-core/src/__tests__/cost-tracker.test.ts`, `packages/voice-core/src/__tests__/state-machine.test.ts`
- Separate directory: `packages/auth/src/__tests__/auth.test.ts`
- Separate directory: `packages/shared/src/__tests__/schemas.test.ts`

**Naming:**
- Unit/integration tests: `*.test.ts`
- E2E tests: `*.spec.ts`

**Include patterns (from root `vitest.config.ts`):**
```
packages/*/src/**/*.test.ts
apps/*/src/**/*.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

describe("Feature/Component Name", () => {
  // Setup at top
  let app: FastifyInstance;

  beforeAll(async () => {
    // One-time setup (create Fastify app, register routes)
  });

  afterAll(async () => {
    // Teardown (close app)
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset state per test
  });

  it("describes expected behavior in plain English", () => {
    // Arrange - Act - Assert
  });
});
```

**Patterns:**
- `describe` blocks group by feature, endpoint, or logical unit
- Nested `describe` blocks for endpoint grouping: `describe("POST /api/billing/checkout", () => { ... })`
- `it` descriptions start with verbs: "should return", "creates", "rejects", "allows", "returns"
- `beforeAll`/`afterAll` for Fastify app lifecycle (create once, close once)
- `beforeEach` for mock reset with `vi.clearAllMocks()`

## Mocking

**Framework:** Vitest built-in `vi.mock()`, `vi.fn()`, `vi.hoisted()`

**Module Mocking Pattern (API tests):**
```typescript
// Hoist env vars before module evaluation
vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_SOLO_PRICE_ID = "price_solo_test";
});

// Mock external SDKs with class replacement
vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = { sessions: { create: mockStripeCheckoutCreate } };
    webhooks = { constructEvent: mockStripeWebhooksConstructEvent };
  },
}));

// Mock internal modules
vi.mock("../lib/supabase.js", () => ({
  createServiceClient: () => supabaseProxy,
}));

vi.mock("../lib/auth.js", () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: "user-123", email: "test@example.com" }),
  requireOrgMembership: vi.fn().mockResolvedValue({ role: "admin" }),
}));
```

**Supabase Mock Pattern (chainable builder):**
```typescript
// Reusable chainable mock that simulates Supabase query builder
function chainResolving(data: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "gte", "limit", "update", "insert", "delete"];
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({ data, error: null });
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  return chain;
}

// Proxy pattern for swappable per-test handlers
let currentFromHandler: (table: string) => Record<string, unknown>;
const supabaseProxy = {
  from: (...args: unknown[]) => currentFromHandler(args[0] as string),
};

function setSupabase(handlers: Record<string, unknown>) {
  currentFromHandler = (table: string) => {
    if (handlers[table]) return handlers[table] as Record<string, unknown>;
    return chainResolving(null);
  };
}
```

**Lightweight Mocks (no external dependencies):**
```typescript
// Simple mock objects for unit tests (no vi.mock needed)
function createMockReply() {
  let statusCode = 200;
  let payload: unknown = null;
  const reply = {
    status(code: number) { statusCode = code; return this; },
    send(body: unknown) { payload = body; return this; },
    get statusCode() { return statusCode; },
    get payload() { return payload; },
  };
  return reply;
}
```

**What to Mock:**
- External service SDKs (Stripe, Supabase client)
- Auth middleware (`requireAuth`, `requireOrgMembership`)
- Environment variables (via `vi.hoisted()`)

**What NOT to Mock:**
- Pure business logic (rank calculations, streak logic, schema validation)
- Zod schemas -- test by calling `safeParse()` directly
- State machines and cost trackers -- test the real implementation

## Fixtures and Factories

**Test Data:**
```typescript
// UUIDs as module-level constants
const TEST_ORG_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

// Builder/helper functions for request payloads
function checkoutPayload(plan: string) {
  return {
    org_id: TEST_ORG_ID,
    plan,
    success_url: "https://app.example.com/success",
    cancel_url: "https://app.example.com/cancel",
  };
}

function webhookRequest(event: unknown) {
  return {
    method: "POST" as const,
    url: "/api/billing/webhook",
    headers: { "stripe-signature": "t=123,v1=abc", "content-type": "application/json" },
    payload: JSON.stringify(event),
  };
}

// Factory for message arrays (voice-core tests)
function makeMessages(count: number, startMs = now - 60_000): ConversationMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `message ${i}`,
    timestamp: startMs + i * 1000,
  }));
}
```

**Location:**
- Fixtures are inline within test files (no shared fixtures directory)
- RLS tests use SQL fixtures in `supabase/tests/rls_policies.test.sql`
- E2E tests use env vars for credentials: `process.env.E2E_TEST_EMAIL`

## Coverage

**Requirements:** No enforced threshold. Coverage available but not gated.

**Configuration (from root `vitest.config.ts`):**
```typescript
coverage: {
  provider: "v8",
  include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
  exclude: ["**/*.test.ts", "**/*.d.ts", "**/index.ts"],
},
```

**View Coverage:**
```bash
pnpm test:coverage       # Generates v8 coverage report
```

## Test Types

**Unit Tests:**
- Pure logic testing without HTTP or database
- Files: `packages/voice-core/src/__tests__/cost-tracker.test.ts`, `packages/voice-core/src/__tests__/state-machine.test.ts`, `packages/voice-core/src/__tests__/llm.test.ts`
- Files: `packages/shared/src/__tests__/schemas.test.ts`, `packages/auth/src/__tests__/auth.test.ts`
- Files: `apps/api/src/lib/http-errors.test.ts`, `apps/api/src/routes/gamification.test.ts`
- Pattern: import function/class, call it, assert result

**Integration Tests (Fastify inject):**
- Use `app.inject()` to test full request/response cycle through Fastify
- Files: `apps/api/src/__tests__/billing.test.ts`, `apps/api/src/__tests__/rate-limit.test.ts`
- Pattern: create Fastify instance, register routes with mocked dependencies, inject HTTP requests

```typescript
const app = Fastify({ logger: false });
await app.register(billingRoutes);
await app.ready();

const res = await app.inject({
  method: "POST",
  url: "/api/billing/checkout",
  headers: { authorization: "Bearer test-token" },
  payload: checkoutPayload("starter"),
});
expect(res.statusCode).toBe(200);
```

**Database Tests (pgTAP):**
- RLS policy verification in `supabase/tests/rls_policies.test.sql`
- Creates fixture data (2 orgs, 6 users with different roles)
- Tests row-level security isolation between organizations
- Run with `supabase test db`

**E2E Tests (Playwright):**
- Full user journey testing in `e2e/simulation-flow.spec.ts`
- Config: single worker, sequential execution, Chromium only
- Mocks external APIs via Playwright route interception (`page.route()`)
- Tests login -> create simulation -> run simulation -> view scorecard
- Web server started automatically via Playwright config

```typescript
// E2E external API mocking
await page.route("**/api.openai.com/**", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({...}) })
);
```

## Common Patterns

**Async Testing:**
```typescript
// Async route handler tests with inject
it("creates a checkout session", async () => {
  mockStripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/..." });
  const res = await app.inject({ method: "POST", url: "/api/billing/checkout", ... });
  expect(res.statusCode).toBe(200);
});

// Async error testing
it("throws AuthError for expired token", async () => {
  await expect(verifyToken(token)).rejects.toThrow(AuthError);
  await expect(verifyToken(token)).rejects.toMatchObject({ code: "expired" });
});
```

**Error Testing:**
```typescript
// Validation rejection
it("rejects invalid plan names", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/billing/checkout",
    payload: checkoutPayload("nonexistent"),
  });
  expect(res.statusCode).toBe(400);
});

// Schema validation testing
it("rejects an organization with invalid plan", () => {
  const result = OrganizationSchema.safeParse({ ...valid, plan: "invalid_plan" });
  expect(result.success).toBe(false);
});
```

**State Machine Testing:**
```typescript
it("allows valid transitions", () => {
  const sm = new VoiceStateMachine();
  expect(sm.transition("LISTENING")).toBe(true);
  expect(sm.state).toBe("LISTENING");
});

it("rejects invalid transitions", () => {
  const sm = new VoiceStateMachine();
  expect(sm.transition("SPEAKING")).toBe(false);
  expect(sm.state).toBe("IDLE");  // unchanged
});
```

**Self-Contained Logic Tests (extracted for testability):**
```typescript
// In gamification.test.ts, business logic is duplicated from the route
// file and tested independently (no HTTP layer needed)
const RANKS = [...];
function getRankForXp(xp: number) { ... }

describe("Rank Progression", () => {
  it("should return Rookie for 0 XP", () => {
    expect(getRankForXp(0).name).toBe("Rookie");
  });
});
```

## Test Inventory

| Location | Type | What it Tests |
|----------|------|---------------|
| `apps/api/src/__tests__/billing.test.ts` | Integration | Stripe checkout, webhooks, usage, feature checks |
| `apps/api/src/__tests__/rate-limit.test.ts` | Integration | Rate limiting with Fastify |
| `apps/api/src/lib/http-errors.test.ts` | Unit | Error response helpers |
| `apps/api/src/routes/gamification.test.ts` | Unit | Rank progression, XP, streaks, badges |
| `packages/shared/src/__tests__/schemas.test.ts` | Unit | Zod schema validation, canAccess |
| `packages/auth/src/__tests__/auth.test.ts` | Unit | JWT verification, token extraction |
| `packages/voice-core/src/__tests__/cost-tracker.test.ts` | Unit | Cost tracking accumulation |
| `packages/voice-core/src/__tests__/state-machine.test.ts` | Unit | Voice state machine transitions |
| `packages/voice-core/src/__tests__/llm.test.ts` | Unit | Context window filtering |
| `e2e/simulation-flow.spec.ts` | E2E | Full simulation user journey |
| `supabase/tests/rls_policies.test.sql` | Database | RLS policy isolation |

---

*Testing analysis: 2026-03-06*

