import type { WebSocket } from "ws";
import {
  DeepgramSTT,
  generateLLMResponse,
  CostTracker,
  type ConversationMessage,
  type TranscriptResult,
} from "@maxima/voice-core";
import type {
  CoachingSuggestion,
  TranscriptUpdate,
  SentimentUpdate,
  SentimentEntry,
  CoachingInsightData,
} from "./types.js";

const COACHING_SYSTEM_PROMPT = `You are an AI sales coach providing real-time coaching to a sales rep during a live call. You can hear what both the rep and the prospect are saying.

Your job is to provide short, actionable suggestions that help the rep close the deal. Keep suggestions under 2 sentences. Be direct and specific.

For each message, analyze the conversation and respond with a JSON object:
{
  "suggestions": [
    {
      "category": "objection" | "question" | "battlecard" | "sentiment",
      "text": "your suggestion text",
      "confidence": 0.0-1.0
    }
  ],
  "sentiment": {
    "score": -1.0 to 1.0,
    "label": "positive" | "neutral" | "negative"
  },
  "topics_covered": ["topic1", "topic2"],
  "topics_missed": ["topic1"]
}

Categories:
- "objection": When the prospect raises an objection, suggest a response
- "question": Suggest a question the rep should ask
- "battlecard": Provide competitive positioning or value prop talking points
- "sentiment": Alert when prospect sentiment shifts significantly

Only suggest when you have something valuable to add. Not every transcript needs a suggestion.
Respond ONLY with valid JSON. No markdown, no explanation.`;

interface SessionConfig {
  sessionId: string;
  userId: string;
  orgId: string;
  ws: WebSocket;
}

export class CoachingSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly orgId: string;
  private readonly ws: WebSocket;
  private readonly stt: DeepgramSTT;
  private readonly costTracker: CostTracker;
  private readonly history: ConversationMessage[] = [];
  private readonly sentimentTimeline: SentimentEntry[] = [];
  private readonly topicsCovered = new Set<string>();
  private readonly topicsMissed = new Set<string>();
  private suggestionsCount = 0;
  private battleCardsCount = 0;
  private repSpeakingMs = 0;
  private prospectSpeakingMs = 0;
  private lastTranscriptTime = Date.now();
  private isProcessing = false;
  private started = false;

  constructor(config: SessionConfig) {
    this.sessionId = config.sessionId;
    this.userId = config.userId;
    this.orgId = config.orgId;
    this.ws = config.ws;
    this.costTracker = new CostTracker();

    this.stt = new DeepgramSTT(
      this.sessionId,
      (result: TranscriptResult) => this.handleTranscript(result),
      {
        model: "nova-2",
        language: "en",
        encoding: "opus",
        sampleRate: 16000,
        channels: 1,
        interimResults: true,
        utteranceEndMs: 1000,
      },
    );

    this.stt.on("error", (err: unknown) => {
      console.error(`[coach] session=${this.sessionId} STT error:`, err);
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.stt.start();
    this.sendEvent("session_started", { session_id: this.sessionId });
    console.log(`[coach] session=${this.sessionId} started`);
  }

  sendAudio(audio: Buffer): void {
    if (!this.started) return;
    this.stt.sendAudio(audio);
  }

  private handleTranscript(result: TranscriptResult): void {
    if (!result.isFinal || !result.transcript.trim()) return;

    const now = Date.now();
    const duration = now - this.lastTranscriptTime;
    this.lastTranscriptTime = now;

    // Heuristic: alternate between rep and prospect based on transcript gaps
    // In a real implementation, speaker diarization would separate channels
    const speaker = this.history.length % 2 === 0 ? "rep" : "prospect";

    if (speaker === "rep") {
      this.repSpeakingMs += duration;
    } else {
      this.prospectSpeakingMs += duration;
    }

    this.costTracker.addSTTSeconds(duration / 1000);

    // Send transcript to client
    const transcriptUpdate: TranscriptUpdate = {
      type: "transcript",
      speaker,
      text: result.transcript,
      timestamp: new Date().toISOString(),
    };
    this.sendJSON(transcriptUpdate);

    // Add to conversation history
    this.history.push({
      role: speaker === "rep" ? "user" : "assistant",
      content: `[${speaker.toUpperCase()}]: ${result.transcript}`,
      timestamp: now,
    });

    // Generate coaching suggestions (debounced — skip if already processing)
    if (!this.isProcessing) {
      this.generateSuggestions();
    }
  }

  private async generateSuggestions(): Promise<void> {
    if (this.history.length === 0) return;
    this.isProcessing = true;

    try {
      let fullResponse = "";
      await generateLLMResponse(
        COACHING_SYSTEM_PROMPT,
        this.history,
        (sentence) => {
          fullResponse += sentence + " ";
        },
        {
          model: "gpt-4o-mini",
          maxTokens: 512,
          contextWindow: 90, // 90-second sliding window
          maxHistoryTurns: 20,
        },
      );

      this.costTracker.addTokens(
        Math.ceil(fullResponse.length * 0.3), // rough input estimate
        Math.ceil(fullResponse.length * 0.25), // rough output estimate
      );

      this.parseLLMResponse(fullResponse.trim());
    } catch (err) {
      console.error(
        `[coach] session=${this.sessionId} LLM error:`,
        (err as Error).message,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private parseLLMResponse(response: string): void {
    try {
      const data = JSON.parse(response);

      // Send suggestions
      if (Array.isArray(data.suggestions)) {
        for (const suggestion of data.suggestions) {
          if (suggestion.text && suggestion.category) {
            const msg: CoachingSuggestion = {
              type: "suggestion",
              category: suggestion.category,
              text: suggestion.text,
              confidence: suggestion.confidence ?? 0.5,
            };
            this.sendJSON(msg);
            this.suggestionsCount++;
            if (suggestion.category === "battlecard") {
              this.battleCardsCount++;
            }
          }
        }
      }

      // Send sentiment update
      if (data.sentiment) {
        const sentimentUpdate: SentimentUpdate = {
          type: "sentiment",
          score: data.sentiment.score ?? 0,
          label: data.sentiment.label ?? "neutral",
        };
        this.sendJSON(sentimentUpdate);

        this.sentimentTimeline.push({
          timestamp: new Date().toISOString(),
          score: sentimentUpdate.score,
          label: sentimentUpdate.label,
        });
      }

      // Track topics
      if (Array.isArray(data.topics_covered)) {
        for (const t of data.topics_covered) this.topicsCovered.add(t);
      }
      if (Array.isArray(data.topics_missed)) {
        for (const t of data.topics_missed) this.topicsMissed.add(t);
      }
    } catch {
      // LLM didn't return valid JSON — skip
      console.warn(
        `[coach] session=${this.sessionId} invalid LLM response`,
      );
    }
  }

  async stop(): Promise<CoachingInsightData> {
    this.stt.close();

    const totalSpeakingMs = this.repSpeakingMs + this.prospectSpeakingMs;
    const talkRatio =
      totalSpeakingMs > 0 ? this.repSpeakingMs / totalSpeakingMs : 0.5;

    // Determine overall sentiment from timeline
    let overallSentiment: "positive" | "neutral" | "negative" = "neutral";
    if (this.sentimentTimeline.length > 0) {
      const avgScore =
        this.sentimentTimeline.reduce((sum, e) => sum + e.score, 0) /
        this.sentimentTimeline.length;
      overallSentiment =
        avgScore > 0.3 ? "positive" : avgScore < -0.3 ? "negative" : "neutral";
    }

    const insights: CoachingInsightData = {
      session_id: this.sessionId,
      org_id: this.orgId,
      sentiment_timeline: this.sentimentTimeline,
      talk_ratio: Math.round(talkRatio * 100) / 100,
      topics_covered: [...this.topicsCovered],
      topics_missed: [...this.topicsMissed],
      suggestions_surfaced: this.suggestionsCount,
      battle_cards_triggered: this.battleCardsCount,
      overall_sentiment: overallSentiment,
    };

    const costs = this.costTracker.getSummary();
    this.sendEvent("session_costs", { ...costs });
    this.sendEvent("session_ended", { session_id: this.sessionId });

    console.log(
      `[coach] session=${this.sessionId} ended — ${this.suggestionsCount} suggestions, ${this.sentimentTimeline.length} sentiment updates`,
    );

    return insights;
  }

  private sendEvent(type: string, data: Record<string, unknown>): void {
    this.sendJSON({ type, ...data });
  }

  private sendJSON(data: unknown): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}
