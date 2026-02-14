import { WebSocketServer, WebSocket } from "ws";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { VoiceSession } from "./session.js";

const PORT = Number(process.env.PORT) || 3002;
const PING_INTERVAL_MS = 30_000;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? "";

// Active sessions keyed by WebSocket
const sessions = new Map<WebSocket, VoiceSession>();

const wss = new WebSocketServer({ port: PORT });
console.log(`Voice WebSocket server listening on port ${PORT}`);

/** Extract JWT from query ?token= or Authorization header */
function extractToken(
  url: string | undefined,
  headers: Record<string, string | string[] | undefined>
): string | null {
  if (url) {
    const params = new URL(url, "http://localhost").searchParams;
    const token = params.get("token");
    if (token) return token;
  }
  const auth = headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return null;
}

/** Verify Supabase JWT and return user_id */
async function verifyToken(token: string): Promise<string | null> {
  try {
    if (SUPABASE_JWT_SECRET) {
      const secret = new TextEncoder().encode(SUPABASE_JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);
      return (payload.sub as string) ?? null;
    }
    if (SUPABASE_URL) {
      const jwks = createRemoteJWKSet(
        new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
      );
      const { payload } = await jwtVerify(token, jwks);
      return (payload.sub as string) ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

wss.on("connection", async (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  const token = extractToken(req.url, req.headers as Record<string, string | string[] | undefined>);

  if (!token) {
    ws.close(4001, "Missing authentication token");
    return;
  }

  const userId = await verifyToken(token);
  if (!userId) {
    ws.close(4003, "Invalid authentication token");
    return;
  }

  // Extract session_id from query params
  const url = new URL(req.url ?? "", "http://localhost");
  const sessionId = url.searchParams.get("session_id") ?? crypto.randomUUID();

  const session = new VoiceSession(sessionId, userId, ws);
  sessions.set(ws, session);

  console.log(
    `[connect] user=${userId} session=${sessionId} client=${clientIp}`
  );

  // Send initial state
  session.sendEvent("connected", {
    session_id: sessionId,
    state: session.state,
  });

  // Keepalive
  let alive = true;
  const pingTimer = setInterval(() => {
    if (!alive) {
      console.log(`[timeout] session=${sessionId} — no pong, terminating`);
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
      // Binary = audio data from client microphone
      handleAudioChunk(session, data as Buffer);
    } else {
      // JSON control messages
      handleControlMessage(session, data.toString());
    }
  });

  ws.on("close", (code, reason) => {
    clearInterval(pingTimer);
    session.cleanup();
    sessions.delete(ws);
    console.log(
      `[disconnect] session=${sessionId} code=${code} reason=${reason.toString()}`
    );
  });

  ws.on("error", (err) => {
    console.error(`[error] session=${sessionId}`, err.message);
  });
});

function handleAudioChunk(session: VoiceSession, audio: Buffer): void {
  // If in IDLE, transition to LISTENING on first audio
  if (session.state === "IDLE") {
    session.stateMachine.transition("LISTENING");
  }

  // If in SPEAKING, this is a barge-in
  if (session.state === "SPEAKING") {
    session.stateMachine.transition("INTERRUPTION");
    session.stateMachine.transition("LISTENING");
  }

  // Forward audio to Deepgram STT (US-018 will implement)
}

function handleControlMessage(session: VoiceSession, raw: string): void {
  try {
    const msg = JSON.parse(raw) as { type: string; [key: string]: unknown };

    switch (msg.type) {
      case "start_listening":
        session.stateMachine.transition("LISTENING");
        break;
      case "stop_listening":
        if (session.state === "LISTENING") {
          session.stateMachine.transition("IDLE");
        }
        break;
      case "end_session":
        session.stateMachine.reset();
        session.sendEvent("session_ended", { session_id: session.sessionId });
        break;
      default:
        console.warn(
          `[control] session=${session.sessionId} unknown type=${msg.type}`
        );
    }
  } catch {
    console.warn(
      `[control] session=${session.sessionId} invalid JSON`
    );
  }
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[shutdown] closing all sessions...");
  for (const [ws, session] of sessions) {
    session.cleanup();
    ws.close(1001, "Server shutting down");
  }
  sessions.clear();
  wss.close(() => process.exit(0));
});
