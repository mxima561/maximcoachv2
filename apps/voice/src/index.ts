import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT) || 3002;
const PING_INTERVAL_MS = 30_000;

const wss = new WebSocketServer({ port: PORT });

console.log(`Voice WebSocket server listening on port ${PORT}`);

wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[connect] client=${clientIp}`);

  let alive = true;

  const pingTimer = setInterval(() => {
    if (!alive) {
      console.log(`[timeout] client=${clientIp} — no pong, terminating`);
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
    // Echo back for now — will be replaced by voice pipeline in US-017+
    ws.send(data, { binary: isBinary });
  });

  ws.on("close", (code, reason) => {
    clearInterval(pingTimer);
    console.log(
      `[disconnect] client=${clientIp} code=${code} reason=${reason.toString()}`
    );
  });

  ws.on("error", (err) => {
    console.error(`[error] client=${clientIp}`, err.message);
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[shutdown] closing WebSocket server...");
  wss.close(() => process.exit(0));
});
