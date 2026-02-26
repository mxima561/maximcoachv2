import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

// --- Constants ---
const TEST_ORG_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

// --- Env vars (must be hoisted before billing module evaluates PLANS) ---

vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_SOLO_PRICE_ID = "price_solo_test";
  process.env.STRIPE_STARTER_PRICE_ID = "price_starter_test";
  process.env.STRIPE_GROWTH_PRICE_ID = "price_growth_test";
  process.env.STRIPE_GROWTH_PRICE = "price_growth_test";
  process.env.STRIPE_SCALE_PRICE_ID = "price_scale_test";
  process.env.STRIPE_ENTERPRISE_PRICE_ID = "price_enterprise_test";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

// --- Mocks ---

const mockStripeCheckoutCreate = vi.fn();
const mockStripeCustomerCreate = vi.fn();
const mockStripeBillingPortalCreate = vi.fn();
const mockStripeWebhooksConstructEvent = vi.fn();

vi.mock("stripe", () => {
  return {
    default: class MockStripe {
      checkout = {
        sessions: { create: mockStripeCheckoutCreate },
      };
      customers = { create: mockStripeCustomerCreate };
      billingPortal = {
        sessions: { create: mockStripeBillingPortalCreate },
      };
      webhooks = {
        constructEvent: mockStripeWebhooksConstructEvent,
      };
    },
  };
});

// The supabase mock is a proxy — billingRoutes captures the supabase instance
// once at registration time, so we need a stable reference whose .from() we can
// swap per-test.
let currentFromHandler: (table: string) => Record<string, unknown>;

const supabaseProxy = {
  from: (...args: unknown[]) => currentFromHandler(args[0] as string),
};

vi.mock("../lib/supabase.js", () => ({
  createServiceClient: () => supabaseProxy,
}));

vi.mock("../lib/auth.js", () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: "user-123", email: "test@example.com" }),
  requireOrgMembership: vi.fn().mockResolvedValue({ role: "admin" }),
}));

import { billingRoutes } from "../routes/billing.js";

// --- Helpers ---

// Simple chainable builder that resolves .single() with given data
function chainResolving(data: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "gte", "limit", "update", "insert", "delete"];
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({ data, error: null });
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  return chain;
}

function setSupabase(handlers: Record<string, unknown>) {
  currentFromHandler = (table: string) => {
    if (handlers[table]) return handlers[table] as Record<string, unknown>;
    // Default fallback: chainable no-ops
    return chainResolving(null);
  };
}

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
    headers: {
      "stripe-signature": "t=123,v1=abc",
      "content-type": "application/json",
    },
    payload: JSON.stringify(event),
  };
}

// --- Test app setup ---

let app: FastifyInstance;

beforeAll(async () => {
  // Set default supabase handler before app registration
  setSupabase({});

  app = Fastify({ logger: false });

  // Raw body parser for webhook tests
  app.addContentTypeParser(
    ["application/json", "application/*+json"],
    { parseAs: "buffer" },
    (_request, body, done) => {
      const rawBody = typeof body === "string" ? Buffer.from(body, "utf8") : body;
      (_request as { rawBody?: Buffer }).rawBody = rawBody;
      if (!rawBody || rawBody.length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(rawBody.toString("utf8")));
      } catch (err) {
        done(err as Error);
      }
    },
  );

  await app.register(billingRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: org without stripe customer
  setSupabase({
    organizations: chainResolving({
      id: TEST_ORG_ID,
      name: "Test Org",
      stripe_customer_id: null,
      plan: "starter",
    }),
  });
});

// --- Tests ---

describe("POST /api/billing/checkout", () => {
  it("creates a checkout session for the starter plan", async () => {
    mockStripeCustomerCreate.mockResolvedValue({ id: "cus_new" });
    mockStripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_starter" });

    const res = await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: { authorization: "Bearer test-token" },
      payload: checkoutPayload("starter"),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.url).toBe("https://checkout.stripe.com/session_starter");
    expect(mockStripeCheckoutCreate).toHaveBeenCalledOnce();
  });

  it("creates a checkout session for the growth plan", async () => {
    mockStripeCustomerCreate.mockResolvedValue({ id: "cus_growth" });
    mockStripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_growth" });

    const res = await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: { authorization: "Bearer test-token" },
      payload: checkoutPayload("growth"),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).url).toContain("checkout.stripe.com");
  });

  it("creates a checkout session for the scale plan", async () => {
    mockStripeCustomerCreate.mockResolvedValue({ id: "cus_scale" });
    mockStripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_scale" });

    const res = await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: { authorization: "Bearer test-token" },
      payload: checkoutPayload("scale"),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).url).toContain("checkout.stripe.com");
  });

  it("rejects invalid plan names", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: { authorization: "Bearer test-token" },
      payload: checkoutPayload("nonexistent"),
    });

    expect(res.statusCode).toBe(400);
  });

  it("reuses existing stripe customer if org already has one", async () => {
    setSupabase({
      organizations: chainResolving({
        id: TEST_ORG_ID,
        name: "Test Org",
        stripe_customer_id: "cus_existing",
        plan: "free",
      }),
    });
    mockStripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/reuse" });

    const res = await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: { authorization: "Bearer test-token" },
      payload: checkoutPayload("starter"),
    });

    expect(res.statusCode).toBe(200);
    expect(mockStripeCustomerCreate).not.toHaveBeenCalled();
  });
});

describe("GET /api/billing/usage", () => {
  it("returns usage within limits for a starter plan", async () => {
    setSupabase({
      organizations: chainResolving({ plan: "starter" }),
      organization_users: {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u1" }, { user_id: "u2" }], error: null }),
        }),
      },
      sessions: {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 10, error: null }),
          }),
        }),
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/billing/usage?org_id=${TEST_ORG_ID}`,
      headers: { authorization: "Bearer test-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.plan).toBe("starter");
    expect(body.sessions_used).toBe(10);
    expect(body.session_limit).toBe(75);
    expect(body.is_within_limit).toBe(true);
  });

  it("reports over-limit usage correctly", async () => {
    setSupabase({
      organizations: chainResolving({ plan: "starter" }),
      organization_users: {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u1" }], error: null }),
        }),
      },
      sessions: {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 80, error: null }),
          }),
        }),
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/billing/usage?org_id=${TEST_ORG_ID}`,
      headers: { authorization: "Bearer test-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessions_used).toBe(80);
    expect(body.session_limit).toBe(75);
    expect(body.is_within_limit).toBe(false);
  });

  it("returns unlimited sessions for enterprise plan", async () => {
    setSupabase({
      organizations: chainResolving({ plan: "enterprise" }),
      organization_users: {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u1" }], error: null }),
        }),
      },
      sessions: {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 999, error: null }),
          }),
        }),
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/billing/usage?org_id=${TEST_ORG_ID}`,
      headers: { authorization: "Bearer test-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.session_limit).toBeNull();
    expect(body.is_within_limit).toBe(true);
  });
});

describe("POST /api/billing/webhook - checkout.session.completed", () => {
  it("updates org plan on successful checkout", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });

    setSupabase({
      trial_sessions: {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
        }),
        delete: deleteMock,
      },
      organizations: {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { trial_starts_at: new Date(Date.now() - 5 * 86400000).toISOString() },
              error: null,
            }),
          }),
        }),
        update: updateMock,
      },
      trial_events: { insert: insertMock },
    });

    const mockEvent = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          mode: "subscription",
          customer: "cus_123",
          metadata: { org_id: "org-1", plan: "growth" },
        },
      },
    };
    mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

    const res = await app.inject(webhookRequest(mockEvent));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ received: true });
    expect(updateMock).toHaveBeenCalled();
  });

  it("returns 400 for invalid webhook signature", async () => {
    mockStripeWebhooksConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const res = await app.inject(webhookRequest({ type: "test" }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("Invalid signature");
  });
});

describe("POST /api/billing/webhook - invoice.payment_failed", () => {
  it("records first payment failure with grace period", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    setSupabase({
      organizations: {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "org-1",
                payment_failed_at: null,
                payment_failure_count: 0,
                plan: "growth",
              },
              error: null,
            }),
          }),
        }),
        update: updateMock,
      },
    });

    const mockEvent = {
      type: "invoice.payment_failed",
      data: {
        object: { id: "inv_123", customer: "cus_123" },
      },
    };
    mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

    const res = await app.inject(webhookRequest(mockEvent));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ received: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ payment_failure_count: 1 }),
    );
  });

  it("downgrades to free after 7-day grace period expires", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString();

    setSupabase({
      organizations: {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "org-1",
                payment_failed_at: eightDaysAgo,
                payment_failure_count: 2,
                plan: "growth",
              },
              error: null,
            }),
          }),
        }),
        update: updateMock,
      },
    });

    const mockEvent = {
      type: "invoice.payment_failed",
      data: {
        object: { id: "inv_456", customer: "cus_123" },
      },
    };
    mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

    const res = await app.inject(webhookRequest(mockEvent));

    expect(res.statusCode).toBe(200);

    const downgradeCall = updateMock.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, unknown>;
        return arg && typeof arg === "object" && "plan" in arg && arg.plan === "free";
      },
    );
    expect(downgradeCall).toBeTruthy();
  });
});

describe("POST /api/billing/webhook - customer.subscription.deleted", () => {
  it("downgrades org to free on subscription deletion", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    setSupabase({
      organizations: { update: updateMock },
    });

    const mockEvent = {
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_123",
          metadata: { org_id: "org-1" },
        },
      },
    };
    mockStripeWebhooksConstructEvent.mockReturnValue(mockEvent);

    const res = await app.inject(webhookRequest(mockEvent));

    expect(res.statusCode).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ plan: "free" });
  });
});

describe("POST /api/billing/checkout - Solo tier", () => {
  it("creates a checkout session for the solo plan", async () => {
    mockStripeCustomerCreate.mockResolvedValue({ id: "cus_solo" });
    mockStripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_solo" });

    const res = await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: { authorization: "Bearer test-token" },
      payload: checkoutPayload("solo"),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).url).toContain("checkout.stripe.com");
  });
});

describe("GET /api/billing/feature-check", () => {
  it("solo plan can access live_coaching", async () => {
    setSupabase({
      organizations: chainResolving({ plan: "solo" }),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/billing/feature-check?org_id=${TEST_ORG_ID}&feature=live_coaching`,
      headers: { authorization: "Bearer test-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.allowed).toBe(true);
  });

  it("solo plan cannot access leaderboards", async () => {
    setSupabase({
      organizations: chainResolving({ plan: "solo" }),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/billing/feature-check?org_id=${TEST_ORG_ID}&feature=leaderboards`,
      headers: { authorization: "Bearer test-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.allowed).toBe(false);
  });

  it("growth plan can access leaderboards", async () => {
    setSupabase({
      organizations: chainResolving({ plan: "growth" }),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/billing/feature-check?org_id=${TEST_ORG_ID}&feature=leaderboards`,
      headers: { authorization: "Bearer test-token" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).allowed).toBe(true);
  });
});
