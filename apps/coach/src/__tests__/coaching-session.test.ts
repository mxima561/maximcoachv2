import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock voice-core before importing CoachingSession
vi.mock("@maxima/voice-core", () => {
  // Use class syntax so mocks work with `new`
  class MockDeepgramSTT {
    on = vi.fn();
    start = vi.fn();
    sendAudio = vi.fn();
    close = vi.fn();
    constructor(_sessionId: string, _onTranscript: Function, _config?: unknown) {}
  }

  class MockCostTracker {
    addTokens = vi.fn();
    addSTTSeconds = vi.fn();
    addTTSSeconds = vi.fn();
    getSummary = vi.fn().mockReturnValue({
      tokens_used: 500,
      audio_seconds_stt: 30,
      audio_seconds_tts: 0,
      cost_usd: 0.01,
    });
    reset = vi.fn();
  }

  return {
    DeepgramSTT: MockDeepgramSTT,
    generateLLMResponse: vi.fn().mockImplementation(
      async (
        _systemPrompt: string,
        _messages: unknown[],
        onSentence: (s: string) => void,
      ) => {
        const response = JSON.stringify({
          suggestions: [
            {
              category: "objection",
              text: "Try addressing their budget concern directly",
              confidence: 0.85,
            },
          ],
          sentiment: { score: 0.2, label: "neutral" },
          topics_covered: ["budget"],
          topics_missed: ["timeline"],
        });
        onSentence(response);
        return response;
      },
    ),
    CostTracker: MockCostTracker,
  };
});

import { CoachingSession } from "../coaching-session.js";

function createMockWs() {
  const sent: string[] = [];
  return {
    OPEN: 1,
    readyState: 1,
    send: vi.fn((data: string) => sent.push(data)),
    _sent: sent,
  };
}

describe("CoachingSession", () => {
  let ws: ReturnType<typeof createMockWs>;
  let session: CoachingSession;

  beforeEach(() => {
    ws = createMockWs();
    session = new CoachingSession({
      sessionId: "test-session-1",
      userId: "user-1",
      orgId: "org-1",
      ws: ws as any,
    });
  });

  it("creates a session with correct properties", () => {
    expect(session.sessionId).toBe("test-session-1");
    expect(session.userId).toBe("user-1");
    expect(session.orgId).toBe("org-1");
  });

  it("sends session_started event on start", async () => {
    await session.start();

    const messages = ws._sent.map((m) => JSON.parse(m));
    const startMsg = messages.find(
      (m: { type: string }) => m.type === "session_started",
    );
    expect(startMsg).toBeDefined();
    expect(startMsg.session_id).toBe("test-session-1");
  });

  it("does not start twice", async () => {
    await session.start();
    const count = ws._sent.length;
    await session.start();
    // No additional messages sent
    expect(ws._sent.length).toBe(count);
  });

  it("returns coaching insights on stop", async () => {
    await session.start();
    const insights = await session.stop();

    expect(insights.session_id).toBe("test-session-1");
    expect(insights.org_id).toBe("org-1");
    expect(typeof insights.talk_ratio).toBe("number");
    expect(insights.talk_ratio).toBeGreaterThanOrEqual(0);
    expect(insights.talk_ratio).toBeLessThanOrEqual(1);
    expect(Array.isArray(insights.sentiment_timeline)).toBe(true);
    expect(Array.isArray(insights.topics_covered)).toBe(true);
    expect(Array.isArray(insights.topics_missed)).toBe(true);
    expect(typeof insights.suggestions_surfaced).toBe("number");
    expect(typeof insights.battle_cards_triggered).toBe("number");
    expect(["positive", "neutral", "negative"]).toContain(
      insights.overall_sentiment,
    );
  });

  it("sends session_ended and session_costs on stop", async () => {
    await session.start();
    await session.stop();

    const messages = ws._sent.map((m) => JSON.parse(m));
    const endMsg = messages.find(
      (m: { type: string }) => m.type === "session_ended",
    );
    const costMsg = messages.find(
      (m: { type: string }) => m.type === "session_costs",
    );

    expect(endMsg).toBeDefined();
    expect(endMsg.session_id).toBe("test-session-1");
    expect(costMsg).toBeDefined();
    expect(costMsg.tokens_used).toBe(500);
  });

  it("accepts audio via sendAudio without error", async () => {
    await session.start();
    // Should not throw
    session.sendAudio(Buffer.from([0, 1, 2, 3]));
  });

  it("ignores audio before start", () => {
    // Should not throw even before start
    session.sendAudio(Buffer.from([0, 1, 2, 3]));
  });
});
