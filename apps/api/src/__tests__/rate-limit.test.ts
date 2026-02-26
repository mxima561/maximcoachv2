import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";

describe("Rate limiting", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Register rate limit with a very low limit for testing
    await app.register(rateLimit, {
      global: false, // only apply to specific routes
    });

    // Test route with tight rate limit
    app.post(
      "/api/test-limited",
      {
        config: {
          rateLimit: {
            max: 2,
            timeWindow: "1 minute",
          },
        },
      },
      async () => ({ ok: true }),
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("allows requests within rate limit", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/test-limited",
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    // First request succeeds (2nd overall)
    const res1 = await app.inject({
      method: "POST",
      url: "/api/test-limited",
    });
    expect(res1.statusCode).toBe(200);

    // Third request should be rate limited
    const res2 = await app.inject({
      method: "POST",
      url: "/api/test-limited",
    });
    expect(res2.statusCode).toBe(429);
  });

  it("returns Retry-After header on 429", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/test-limited",
    });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });
});
