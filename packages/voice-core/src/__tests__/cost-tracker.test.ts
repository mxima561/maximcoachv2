import { describe, it, expect } from "vitest";
import { CostTracker } from "../cost-tracker.js";

describe("CostTracker", () => {
  it("starts with zero costs", () => {
    const tracker = new CostTracker();
    const summary = tracker.getSummary();
    expect(summary.tokens_used).toBe(0);
    expect(summary.audio_seconds_stt).toBe(0);
    expect(summary.audio_seconds_tts).toBe(0);
    expect(summary.cost_usd).toBe(0);
  });

  it("tracks token usage", () => {
    const tracker = new CostTracker();
    tracker.addTokens(1000, 500);
    const summary = tracker.getSummary();
    expect(summary.tokens_used).toBe(1500);
  });

  it("accumulates multiple addTokens calls", () => {
    const tracker = new CostTracker();
    tracker.addTokens(100, 50);
    tracker.addTokens(200, 100);
    expect(tracker.getSummary().tokens_used).toBe(450);
  });

  it("tracks STT audio seconds", () => {
    const tracker = new CostTracker();
    tracker.addSTTSeconds(30);
    tracker.addSTTSeconds(15.5);
    expect(tracker.getSummary().audio_seconds_stt).toBe(45.5);
  });

  it("tracks TTS audio seconds", () => {
    const tracker = new CostTracker();
    tracker.addTTSSeconds(10.123);
    expect(tracker.getSummary().audio_seconds_tts).toBe(10.12); // rounded to 2 decimals
  });

  it("calculates cost correctly", () => {
    const tracker = new CostTracker();
    // 1M input tokens @ $2.50, 1M output tokens @ $10
    tracker.addTokens(1_000_000, 1_000_000);
    // 60s STT @ $0.0077/min = $0.0077
    tracker.addSTTSeconds(60);
    // 60s TTS @ $0.09/min = $0.09
    tracker.addTTSSeconds(60);

    const summary = tracker.getSummary();
    // LLM: $2.50 + $10.00 = $12.50
    // STT: $0.0077
    // TTS: $0.09
    // Total: $12.5977
    expect(summary.cost_usd).toBe(12.5977);
  });

  it("resets all counters", () => {
    const tracker = new CostTracker();
    tracker.addTokens(5000, 2000);
    tracker.addSTTSeconds(120);
    tracker.addTTSSeconds(60);
    tracker.reset();

    const summary = tracker.getSummary();
    expect(summary.tokens_used).toBe(0);
    expect(summary.audio_seconds_stt).toBe(0);
    expect(summary.audio_seconds_tts).toBe(0);
    expect(summary.cost_usd).toBe(0);
  });
});
