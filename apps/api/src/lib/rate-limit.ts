import type { FastifyInstance, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { getValkey } from "./valkey.js";

/**
 * Per-route rate limit overrides.
 * Keyed by route URL pattern (must match the registered route).
 */
const ROUTE_LIMITS: Record<string, { max: number; timeWindow: string }> = {
  "/api/personas/generate": { max: 10, timeWindow: "1 hour" },
  "/api/scorecard": { max: 20, timeWindow: "1 hour" },
  "/api/billing/checkout": { max: 5, timeWindow: "1 hour" },
};

function extractUserId(request: FastifyRequest): string {
  // Try to extract userId from the authorization header
  // The auth middleware will have already parsed this, but rate limiting
  // runs before route handlers so we need a lightweight extraction here
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    // Use the token as a fingerprint — unique per user session
    const token = auth.slice(7);
    // Hash the token to a shorter key for Redis
    return `user:${token.slice(-16)}`;
  }
  return `ip:${request.ip}`;
}

export async function registerRateLimit(app: FastifyInstance) {
  const redis = getValkey();

  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: extractUserId,
    // Use Valkey/Redis as the store if available, otherwise in-memory
    ...(redis ? { redis } : {}),
    errorResponseBuilder: (_request, context) => ({
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please try again later",
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
  });

  // Apply per-route overrides
  for (const [route, limits] of Object.entries(ROUTE_LIMITS)) {
    app.addHook("onRoute", (routeOptions) => {
      if (routeOptions.url === route && routeOptions.method === "POST") {
        routeOptions.config = {
          ...routeOptions.config,
          rateLimit: {
            max: limits.max,
            timeWindow: limits.timeWindow,
            keyGenerator: extractUserId,
          },
        };
      }
    });
  }
}
