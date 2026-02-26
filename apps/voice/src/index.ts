import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import { verifyToken as verifyAuthToken, extractToken as extractAuthToken } from "@maxima/auth";
import { VoiceSession } from "./session.js";
import { VoicePipeline } from "./pipeline.js";
import type {
  PersonaConfig,
  ScenarioConfig,
  DifficultyParams,
} from "./llm.js";

const PORT = Number(process.env.PORT) || 3002;
const PING_INTERVAL_MS = 30_000;

// Active sessions keyed by WebSocket
const sessions = new Map<WebSocket, VoiceSession>();
const pipelines = new Map<WebSocket, VoicePipeline>();

// Validate required API keys at startup
const requiredKeys = [
  ["DEEPGRAM_API_KEY", process.env.DEEPGRAM_API_KEY],
  ["ELEVENLABS_API_KEY", process.env.ELEVENLABS_API_KEY],
  ["OPENAI_API_KEY", process.env.OPENAI_API_KEY],
] as const;
const missingKeys = requiredKeys.filter(([, v]) => !v).map(([k]) => k);
if (missingKeys.length > 0) {
  console.warn(`[voice] WARNING: Missing API keys: ${missingKeys.join(", ")}. Pipeline calls will fail.`);
}

const wss = new WebSocketServer({ port: PORT });
console.log(`Voice WebSocket server listening on port ${PORT}`);

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
      handleAudioChunk(ws, session, data as Buffer);
    } else {
      // JSON control messages
      handleControlMessage(ws, session, data.toString());
    }
  });

  ws.on("close", (code, reason) => {
    clearInterval(pingTimer);
    const pipeline = pipelines.get(ws);
    if (pipeline) {
      pipeline.stop();
      pipelines.delete(ws);
    }
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

function handleAudioChunk(ws: WebSocket, session: VoiceSession, audio: Buffer): void {
  const pipeline = pipelines.get(ws);

  // If in IDLE, transition to LISTENING on first audio
  if (session.state === "IDLE") {
    session.stateMachine.transition("LISTENING");
  }

  // If in SPEAKING, this is a barge-in — delegate to pipeline
  if (session.state === "SPEAKING" && pipeline) {
    pipeline.handleBargeIn();
  }

  // Forward audio to Deepgram STT via pipeline
  if (pipeline) {
    pipeline.sendAudio(audio);
  }
}

function handleControlMessage(ws: WebSocket, session: VoiceSession, raw: string): void {
  try {
    const msg = JSON.parse(raw) as { type: string; [key: string]: unknown };

    switch (msg.type) {
      case "start_session": {
        // Client sends persona, scenario, difficulty to start the pipeline
        const persona = msg.persona as PersonaConfig;
        const scenario = msg.scenario as ScenarioConfig;
        const difficulty = msg.difficulty as DifficultyParams;
        const voiceId = (msg.voice_id as string) ?? undefined;

        const pipeline = new VoicePipeline(
          session,
          persona,
          scenario,
          difficulty,
          voiceId
        );
        pipelines.set(ws, pipeline);
        pipeline.start();
        break;
      }
      case "start_listening":
        session.stateMachine.transition("LISTENING");
        break;
      case "stop_listening":
        if (session.state === "LISTENING") {
          session.stateMachine.transition("IDLE");
        }
        break;
      case "end_session": {
        const pipeline = pipelines.get(ws);
        if (pipeline) {
          pipeline.stop();
          pipelines.delete(ws);
        }
        session.stateMachine.reset();
        session.sendEvent("session_ended", { session_id: session.sessionId });
        break;
      }
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
  for (const [ws, pipeline] of pipelines) {
    pipeline.stop();
  }
  pipelines.clear();
  for (const [ws, session] of sessions) {
    session.cleanup();
    ws.close(1001, "Server shutting down");
  }
  sessions.clear();
  wss.close(() => process.exit(0));
});
