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

await app.register(cors, {
  origin: WEB_ORIGIN,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
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

// Sentry error handler
app.setErrorHandler((error, request, reply) => {
  // Log to Sentry
  Sentry.captureException(error, {
    contexts: {
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers,
      },
    },
    user: {
      id: request.headers["x-user-id"] as string,
    },
  });

  // Log locally
  request.log.error(error);

  // Send response
  reply.status(error.statusCode || 500).send({
    error: error.message || "Internal Server Error",
    statusCode: error.statusCode || 500,
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
