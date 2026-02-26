import type {
  ConnectionStatus,
  CoachingSuggestion,
  TranscriptUpdate,
  SentimentUpdate,
  ServerMessage,
} from "./types.js";

// DOM elements
const statusEl = document.getElementById("status") as HTMLSpanElement;
const statusDot = document.getElementById("status-dot") as HTMLSpanElement;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
const durationEl = document.getElementById("duration") as HTMLSpanElement;
const transcriptEl = document.getElementById("transcript") as HTMLDivElement;
const suggestionsEl = document.getElementById("suggestions") as HTMLDivElement;
const sentimentBar = document.getElementById("sentiment-bar") as HTMLDivElement;
const sentimentLabel = document.getElementById("sentiment-label") as HTMLSpanElement;
const talkRatioBar = document.getElementById("talk-ratio-bar") as HTMLDivElement;
const talkRatioLabel = document.getElementById("talk-ratio-label") as HTMLSpanElement;

let durationTimer: ReturnType<typeof setInterval> | null = null;
let startTime = 0;
let repMs = 0;
let prospectMs = 0;

function updateStatus(newStatus: ConnectionStatus): void {
  statusEl.textContent = newStatus;
  statusDot.className = `status-dot ${newStatus}`;

  if (newStatus === "connected") {
    startBtn.style.display = "none";
    stopBtn.style.display = "block";
    startDurationTimer();
  } else {
    startBtn.style.display = "block";
    stopBtn.style.display = "none";
    stopDurationTimer();
  }
}

function startDurationTimer(): void {
  startTime = Date.now();
  durationTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    durationEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
  }, 1000);
}

function stopDurationTimer(): void {
  if (durationTimer) {
    clearInterval(durationTimer);
    durationTimer = null;
  }
  durationEl.textContent = "0:00";
}

function addTranscript(update: TranscriptUpdate): void {
  const line = document.createElement("div");
  line.className = `transcript-line ${update.speaker}`;

  const speakerSpan = document.createElement("span");
  speakerSpan.className = "speaker";
  speakerSpan.textContent = update.speaker.toUpperCase();

  const textNode = document.createTextNode(` ${update.text}`);
  line.appendChild(speakerSpan);
  line.appendChild(textNode);

  transcriptEl.appendChild(line);

  // Keep last 20 lines
  while (transcriptEl.children.length > 20) {
    transcriptEl.removeChild(transcriptEl.firstChild!);
  }

  transcriptEl.scrollTop = transcriptEl.scrollHeight;

  // Update talk ratio heuristic
  const estimatedMs = update.text.length * 60;
  if (update.speaker === "rep") {
    repMs += estimatedMs;
  } else {
    prospectMs += estimatedMs;
  }
  const total = repMs + prospectMs;
  if (total > 0) {
    const ratio = Math.round((repMs / total) * 100);
    talkRatioBar.style.width = `${ratio}%`;
    talkRatioLabel.textContent = `${ratio}% rep`;
  }
}

function addSuggestion(suggestion: CoachingSuggestion): void {
  const card = document.createElement("div");
  card.className = `suggestion-card ${suggestion.category}`;

  const header = document.createElement("div");
  header.className = "suggestion-header";

  const categorySpan = document.createElement("span");
  categorySpan.className = "category-icon";
  categorySpan.textContent = suggestion.category;

  const confidenceLevel =
    suggestion.confidence >= 0.8
      ? "high"
      : suggestion.confidence >= 0.5
        ? "medium"
        : "low";

  const confidenceSpan = document.createElement("span");
  confidenceSpan.className = `confidence ${confidenceLevel}`;
  confidenceSpan.textContent = confidenceLevel;

  header.appendChild(categorySpan);
  header.appendChild(confidenceSpan);

  const textDiv = document.createElement("div");
  textDiv.className = "suggestion-text";
  textDiv.textContent = suggestion.text;

  card.appendChild(header);
  card.appendChild(textDiv);

  // Insert at top, keep max 3
  suggestionsEl.insertBefore(card, suggestionsEl.firstChild);
  while (suggestionsEl.children.length > 3) {
    suggestionsEl.removeChild(suggestionsEl.lastChild!);
  }

  // Fade-in animation
  card.style.opacity = "0";
  requestAnimationFrame(() => {
    card.style.transition = "opacity 0.3s ease-in";
    card.style.opacity = "1";
  });
}

function updateSentiment(update: SentimentUpdate): void {
  const colors: Record<string, string> = {
    positive: "#22c55e",
    neutral: "#6b7280",
    negative: "#ef4444",
  };
  sentimentBar.style.backgroundColor = colors[update.label] ?? "#6b7280";
  sentimentBar.style.width = `${Math.abs(update.score) * 100}%`;
  sentimentLabel.textContent = update.label;
}

// Handle messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "status_update") {
    updateStatus(message.status as ConnectionStatus);
  } else if (message.type === "server_message") {
    const data = message.data as ServerMessage;
    switch (data.type) {
      case "transcript":
        addTranscript(data as TranscriptUpdate);
        break;
      case "suggestion":
        addSuggestion(data as CoachingSuggestion);
        break;
      case "sentiment":
        updateSentiment(data as SentimentUpdate);
        break;
    }
  }
});

// Start button
startBtn.addEventListener("click", async () => {
  const result = await chrome.storage.local.get(["coachUrl", "authToken", "orgId"]);
  const coachUrl = result.coachUrl || "ws://localhost:3003";
  const authToken = result.authToken;
  const orgId = result.orgId;

  if (!authToken || !orgId) {
    statusEl.textContent = "Missing auth token or org ID — check settings";
    return;
  }

  chrome.runtime.sendMessage({
    type: "start_coaching",
    config: { coachUrl, authToken, orgId },
  });
});

// Stop button
stopBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "stop_coaching" });
});

// Initial state check
chrome.runtime.sendMessage({ type: "get_status" }, (response) => {
  if (response?.status) {
    updateStatus(response.status as ConnectionStatus);
  }
});
