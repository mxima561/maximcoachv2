import Fastify from "fastify";
import cors from "@fastify/cors";
import { personaRoutes } from "./routes/persona.js";
import { scorecardRoutes } from "./routes/scorecard.js";

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

app.get("/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
}));

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
