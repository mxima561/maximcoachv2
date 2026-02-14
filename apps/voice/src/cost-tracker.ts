// ── Unit rates ────────────────────────────────────────────────
const RATES = {
  deepgram_per_minute: 0.0077,
  claude_input_per_1m: 3.0,
  claude_output_per_1m: 15.0,
  elevenlabs_per_minute: 0.09,
} as const;

// ── Tracker ───────────────────────────────────────────────────

export class CostTracker {
  private inputTokens = 0;
  private outputTokens = 0;
  private sttSeconds = 0;
  private ttsSeconds = 0;

  addTokens(input: number, output: number) {
    this.inputTokens += input;
    this.outputTokens += output;
  }

  addSTTSeconds(seconds: number) {
    this.sttSeconds += seconds;
  }

  addTTSSeconds(seconds: number) {
    this.ttsSeconds += seconds;
  }

  getSummary() {
    const claudeCost =
      (this.inputTokens / 1_000_000) * RATES.claude_input_per_1m +
      (this.outputTokens / 1_000_000) * RATES.claude_output_per_1m;
    const sttCost = (this.sttSeconds / 60) * RATES.deepgram_per_minute;
    const ttsCost = (this.ttsSeconds / 60) * RATES.elevenlabs_per_minute;

    return {
      tokens_used: this.inputTokens + this.outputTokens,
      audio_seconds_stt: Math.round(this.sttSeconds * 100) / 100,
      audio_seconds_tts: Math.round(this.ttsSeconds * 100) / 100,
      cost_usd: Math.round((claudeCost + sttCost + ttsCost) * 10000) / 10000,
    };
  }

  reset() {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.sttSeconds = 0;
    this.ttsSeconds = 0;
  }
}
