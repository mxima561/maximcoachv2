import type { ConnectionStatus, SessionConfig, ServerMessage } from "./types.js";

let ws: WebSocket | null = null;
let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let processor: ScriptProcessorNode | null = null;
let status: ConnectionStatus = "disconnected";
let sessionId: string | null = null;

function updateStatus(newStatus: ConnectionStatus): void {
  status = newStatus;
  chrome.runtime.sendMessage({ type: "status_update", status }).catch(() => {
    // Popup might not be open
  });
}

function forwardToPopup(message: ServerMessage): void {
  chrome.runtime.sendMessage({ type: "server_message", data: message }).catch(() => {
    // Popup might not be open
  });
}

async function startCoaching(config: SessionConfig): Promise<void> {
  if (ws) {
    return;
  }

  updateStatus("connecting");

  // Connect to coaching WebSocket
  const url = new URL(config.coachUrl);
  url.searchParams.set("token", config.authToken);
  url.searchParams.set("session_id", crypto.randomUUID());

  ws = new WebSocket(url.toString());

  ws.onopen = () => {
    updateStatus("connected");
    // Start the coaching session
    ws?.send(JSON.stringify({
      type: "start_session",
      org_id: config.orgId,
    }));
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as ServerMessage;
      forwardToPopup(message);

      if (message.type === "connected") {
        sessionId = (message as { session_id: string }).session_id;
      }
    } catch {
      // Invalid JSON from server
    }
  };

  ws.onerror = () => {
    updateStatus("error");
  };

  ws.onclose = () => {
    ws = null;
    sessionId = null;
    updateStatus("disconnected");
    stopAudioCapture();
  };

  // Start capturing tab audio
  await startAudioCapture();
}

async function startAudioCapture(): Promise<void> {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Capture tab audio via callback API
    mediaStream = await new Promise<MediaStream | null>((resolve) => {
      chrome.tabCapture.capture(
        { audio: true, video: false },
        (stream) => resolve(stream ?? null),
      );
    });

    if (!mediaStream) return;

    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(mediaStream);

    // Use ScriptProcessorNode for PCM access
    // Buffer size: 4096 samples at 16kHz ≈ 256ms chunks
    processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const inputData = event.inputBuffer.getChannelData(0);

      // Convert Float32 PCM to Int16 PCM
      const int16Data = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Send as binary
      ws.send(int16Data.buffer);
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  } catch (err) {
    console.error("[extension] audio capture error:", err);
    updateStatus("error");
  }
}

function stopAudioCapture(): void {
  if (processor) {
    processor.disconnect();
    processor = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}

function stopCoaching(): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "end_session" }));
    ws.close();
  }
  ws = null;
  sessionId = null;
  stopAudioCapture();
  updateStatus("disconnected");
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case "start_coaching": {
      const config = message.config as SessionConfig;
      startCoaching(config).then(() => sendResponse({ ok: true }));
      return true; // async response
    }
    case "stop_coaching": {
      stopCoaching();
      sendResponse({ ok: true });
      return false;
    }
    case "get_status": {
      sendResponse({ status, sessionId });
      return false;
    }
    default:
      return false;
  }
});
