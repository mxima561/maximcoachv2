import Fastify from "fastify";
import cors from "@fastify/cors";
import { personaRoutes } from "./routes/persona.js";
import { scorecardRoutes } from "./routes/scorecard.js";
import { challengeRoutes } from "./routes/challenges.js";
import { salesforceRoutes } from "./routes/crm-salesforce.js";
import { hubspotRoutes } from "./routes/crm-hubspot.js";
import { startWorkers, getQueueHealth } from "./lib/queues.js";

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

await app.register(cors, { origin: WEB_ORIGIN });
await app.register(personaRoutes);
await app.register(scorecardRoutes);
await app.register(challengeRoutes);
await app.register(salesforceRoutes);
await app.register(hubspotRoutes);

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
