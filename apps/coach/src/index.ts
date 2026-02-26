import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import {
  verifyToken as verifyAuthToken,
  extractToken as extractAuthToken,
} from "@maxima/auth";
import { CoachingSession } from "./coaching-session.js";
import { createServiceClient } from "./supabase.js";
import type { ClientMessage } from "./types.js";

const PORT = Number(process.env.PORT) || 3003;
const PING_INTERVAL_MS = 30_000;

const sessions = new Map<WebSocket, CoachingSession>();
const supabase = createServiceClient();

// Validate required API keys at startup
const requiredKeys = [
  ["DEEPGRAM_API_KEY", process.env.DEEPGRAM_API_KEY],
  ["OPENAI_API_KEY", process.env.OPENAI_API_KEY],
] as const;
const missingKeys = requiredKeys.filter(([, v]) => !v).map(([k]) => k);
if (missingKeys.length > 0) {
  console.warn(
    `[coach] WARNING: Missing API keys: ${missingKeys.join(", ")}. Pipeline calls will fail.`,
  );
}

const wss = new WebSocketServer({ port: PORT });
console.log(`Coach WebSocket server listening on port ${PORT}`);

wss.on("connection", async (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  const token = extractAuthToken({
    url: req.url,
    headers: req.headers as Record<string, string | string[] | undefined>,
  });

  if (!token) {
    ws.close(4001, "Missing authentication token");
    return;
  }

  let userId: string;
  try {
    const claims = await verifyAuthToken(token);
    userId = claims.userId;
  } catch {
    ws.close(4003, "Invalid authentication token");
    return;
  }

  const url = new URL(req.url ?? "", "http://localhost");
  const sessionId = url.searchParams.get("session_id") ?? crypto.randomUUID();

  console.log(
    `[coach] [connect] user=${userId} session=${sessionId} client=${clientIp}`,
  );

  ws.send(
    JSON.stringify({
      type: "connected",
      session_id: sessionId,
    }),
  );

  // Keepalive
  let alive = true;
  const pingTimer = setInterval(() => {
    if (!alive) {
      console.log(
        `[coach] [timeout] session=${sessionId} — no pong, terminating`,
      );
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, PING_INTERVAL_MS);

  ws.on("pong", () => {
    alive = true;
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      const session = sessions.get(ws);
      if (session) {
        session.sendAudio(data as Buffer);
      }
    } else {
      handleControlMessage(ws, userId, sessionId, data.toString());
    }
  });

  ws.on("close", async (code, reason) => {
    clearInterval(pingTimer);
    const session = sessions.get(ws);
    if (session) {
      try {
        const insights = await session.stop();
        await supabase.from("coaching_insights").insert(insights);
      } catch (err) {
        console.error(
          `[coach] session=${sessionId} error saving insights:`,
          (err as Error).message,
        );
      }
      sessions.delete(ws);
    }
    console.log(
      `[coach] [disconnect] session=${sessionId} code=${code} reason=${reason.toString()}`,
    );
  });

  ws.on("error", (err) => {
    console.error(`[coach] [error] session=${sessionId}`, err.message);
  });
});

function handleControlMessage(
  ws: WebSocket,
  userId: string,
  sessionId: string,
  raw: string,
): void {
  try {
    const msg = JSON.parse(raw) as ClientMessage;

    switch (msg.type) {
      case "start_session": {
        const orgId = msg.org_id as string;
        if (!orgId) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "org_id is required",
            }),
          );
          return;
        }

        const session = new CoachingSession({
          sessionId,
          userId,
          orgId,
          ws,
        });
        sessions.set(ws, session);
        session.start();
        break;
      }

      case "end_session": {
        const session = sessions.get(ws);
        if (session) {
          session.stop().then(async (insights) => {
            try {
              await supabase.from("coaching_insights").insert(insights);
            } catch (err) {
              console.error(
                `[coach] session=${sessionId} error saving insights:`,
                (err as Error).message,
              );
            }
            sessions.delete(ws);
          });
        }
        break;
      }

      default:
        console.warn(
          `[coach] session=${sessionId} unknown message type=${msg.type}`,
        );
    }
  } catch {
    console.warn(`[coach] session=${sessionId} invalid JSON`);
  }
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[coach] [shutdown] closing all sessions...");
  const stopPromises: Promise<void>[] = [];
  for (const [ws, session] of sessions) {
    stopPromises.push(
      session.stop().then(async (insights) => {
        try {
          await supabase.from("coaching_insights").insert(insights);
        } catch {
          // Best effort during shutdown
        }
        ws.close(1001, "Server shutting down");
      }),
    );
  }
  Promise.allSettled(stopPromises).then(() => {
    sessions.clear();
    wss.close(() => process.exit(0));
  });
});
