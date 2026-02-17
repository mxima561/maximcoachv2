import "dotenv/config";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { personaRoutes } from "./routes/persona.js";
import { scorecardRoutes } from "./routes/scorecard.js";
import { challengeRoutes } from "./routes/challenges.js";
import { salesforceRoutes } from "./routes/crm-salesforce.js";
import { hubspotRoutes } from "./routes/crm-hubspot.js";
import { billingRoutes } from "./routes/billing.js";
import { conversationTokenRoutes } from "./routes/conversation-token.js";
import { trialRoutes } from "./routes/trial.js";
import { sessionRoutes } from "./routes/sessions.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import { startWorkers, getQueueHealth } from "./lib/queues.js";

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  integrations: [
    nodeProfilingIntegration(),
  ],
  enabled: process.env.NODE_ENV === "production",
  beforeSend(event, hint) {
    // Filter out health check errors
    if (event.request?.url?.includes("/health")) {
      return null;
    }
    return event;
  },
});

const PORT = Number(process.env.PORT) || 3001;
const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:3000";

const app = Fastify({
  logger: {
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty" }
        : undefined,
  },
});

// Capture raw body for Stripe webhooks while still parsing JSON
app.addContentTypeParser(
  ["application/json", "application/*+json"],
  { parseAs: "buffer" },
  (request, body, done) => {
    const rawBody =
      typeof body === "string" ? Buffer.from(body, "utf8") : body;
    (request as { rawBody?: Buffer }).rawBody = rawBody;
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

await app.register(cors, {
  origin: WEB_ORIGIN,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
});

// Sentry request context tracking
app.addHook("onRequest", async (request, reply) => {
  // Start a new span for performance tracking
  const transaction = (Sentry as unknown as {
    startTransaction?: (context: Record<string, unknown>) => {
      setHttpStatus: (code: number) => void;
      finish: () => void;
    };
  }).startTransaction?.({
    op: "http.server",
    name: `${request.method} ${request.routeOptions.url || request.url}`,
    data: {
      method: request.method,
      url: request.url,
      headers: request.headers,
    },
  });

  // Attach transaction to request for later use
  (request as any).sentryTransaction = transaction;
});

app.addHook("onResponse", async (request, reply) => {
  // Finish the transaction
  const transaction = (request as any).sentryTransaction;
  if (transaction) {
    transaction.setHttpStatus(reply.statusCode);
    transaction.finish();
  }
});
await app.register(personaRoutes);
await app.register(scorecardRoutes);
await app.register(challengeRoutes);
await app.register(salesforceRoutes);
await app.register(hubspotRoutes);
await app.register(billingRoutes);
await app.register(conversationTokenRoutes);
await app.register(trialRoutes);
await app.register(sessionRoutes);
await app.register(onboardingRoutes);

// Sentry error handler
app.setErrorHandler((error, request, reply) => {
  const err = error as { statusCode?: number; message?: string };
  const statusCode = typeof err.statusCode === "number" ? err.statusCode : 500;
  // Extract user info from request if available
  const userId = request.headers["x-user-id"] as string;
  const authorization = request.headers.authorization;

  // Capture exception with full context
  Sentry.captureException(error, {
    contexts: {
      fastify: {
        method: request.method,
        url: request.url,
        route: request.routeOptions?.url,
        params: request.params,
        query: request.query,
        ip: request.ip,
      },
    },
    user: userId ? {
      id: userId,
    } : undefined,
    tags: {
      route: request.routeOptions?.url || request.url,
      method: request.method,
      status_code: statusCode,
    },
    level: statusCode < 500 ? "warning" : "error",
  });

  // Finish transaction if exists
  const transaction = (request as any).sentryTransaction;
  if (transaction) {
    transaction.setHttpStatus(statusCode);
    transaction.finish();
  }

  // Log locally
  request.log.error(error);

  // Send response
  reply.status(statusCode).send({
    error: err.message || "Internal Server Error",
    statusCode,
  });
});

app.get("/health", async () => {
  const queues = await getQueueHealth().catch(() => null);
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    queues,
  };
});

// Start BullMQ workers
startWorkers();

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
