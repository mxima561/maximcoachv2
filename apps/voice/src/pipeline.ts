import { DeepgramSTT, type TranscriptResult } from "./stt.js";
import {
  generateResponse,
  type PersonaConfig,
  type ScenarioConfig,
  type DifficultyParams,
} from "./llm.js";
import { ElevenLabsTTS } from "./tts.js";
import { CostTracker } from "./cost-tracker.js";
import type { VoiceSession } from "./session.js";

/**
 * VoicePipeline wires the full loop:
 * Browser mic → Deepgram STT → OpenAI LLM → ElevenLabs TTS → Browser speaker
 */
export class VoicePipeline {
  private session: VoiceSession;
  private stt: DeepgramSTT;
  private tts: ElevenLabsTTS;
  private persona: PersonaConfig;
  private scenario: ScenarioConfig;
  private difficulty: DifficultyParams;
  private startTime = 0;
  private processing = false;
  readonly costTracker = new CostTracker();

  constructor(
    session: VoiceSession,
    persona: PersonaConfig,
    scenario: ScenarioConfig,
    difficulty: DifficultyParams,
    voiceId?: string
  ) {
    this.session = session;
    this.persona = persona;
    this.scenario = scenario;
    this.difficulty = difficulty;

    // TTS
    this.tts = new ElevenLabsTTS(session, voiceId);

    // STT → on final transcript, process through LLM → TTS
    this.stt = new DeepgramSTT(session, (result: TranscriptResult) => {
      this.handleFinalTranscript(result);
    });
  }

  start(): void {
    this.startTime = Date.now();
    this.stt.start();
    this.session.sendEvent("pipeline_ready", {
      session_id: this.session.sessionId,
    });
    console.log(`[pipeline] session=${this.session.sessionId} started`);
  }

  /** Forward raw audio from browser to Deepgram */
  sendAudio(audio: Buffer): void {
    this.stt.sendAudio(audio);
  }

  /** Handle barge-in: stop TTS, flush audio, transition states */
  handleBargeIn(): void {
    console.log(`[pipeline] session=${this.session.sessionId} barge-in detected`);

    // Stop TTS immediately
    this.tts.flush();

    // Tell client to clear audio buffer
    this.session.sendEvent("flush_audio", {});

    // Mark current AI response as interrupted in history
    const lastTurn = this.session.history[this.session.history.length - 1];
    if (lastTurn && lastTurn.role === "assistant") {
      lastTurn.interrupted = true;
    }

    // State: SPEAKING → INTERRUPTION → LISTENING
    this.session.stateMachine.transition("INTERRUPTION");
    this.session.stateMachine.transition("LISTENING");

    // Reset TTS for next response
    this.tts.reset();
  }

  private async handleFinalTranscript(result: TranscriptResult): Promise<void> {
    const { transcript } = result;
    if (!transcript.trim()) return;

    // Guard against concurrent processing (e.g. rapid final transcripts)
    if (this.processing) {
      console.warn(`[pipeline] session=${this.session.sessionId} dropping transcript — already processing`);
      return;
    }
    this.processing = true;

    const sttDone = Date.now();

    // Transition: LISTENING → PROCESSING
    this.session.stateMachine.transition("PROCESSING");

    // Queue of TTS promises to await sequentially
    const ttsQueue: Promise<void>[] = [];
    const sentences: string[] = [];
    let firstSentenceTime = 0;

    try {
      await generateResponse(
        this.session,
        transcript,
        this.persona,
        this.scenario,
        this.difficulty,
        (sentence: string) => {
          sentences.push(sentence);

          // On first sentence, transition to SPEAKING and start TTS
          if (sentences.length === 1) {
            firstSentenceTime = Date.now();
            this.session.stateMachine.transition("SPEAKING");
          }

          // Queue TTS — each speak() awaits the previous one finishing
          const prev = ttsQueue[ttsQueue.length - 1] ?? Promise.resolve();
          ttsQueue.push(prev.then(() => this.tts.speak(sentence)));
        }
      );

      // Wait for all TTS audio to finish sending
      if (ttsQueue.length > 0) {
        await ttsQueue[ttsQueue.length - 1];
      }

      // Log latency metrics
      if (firstSentenceTime > 0) {
        const totalLatency = firstSentenceTime - sttDone;
        console.log(
          `[pipeline] session=${this.session.sessionId} ` +
            `latency=${totalLatency}ms sentences=${sentences.length}`
        );
        this.session.sendEvent("latency", {
          stt_to_first_audio_ms: totalLatency,
        });
      }
    } catch (err) {
      console.error(
        `[pipeline] session=${this.session.sessionId} LLM error`,
        err instanceof Error ? err.message : err
      );
      this.session.sendEvent("error", {
        message: "Failed to generate response",
      });
    }

    // After all TTS is done, transition back to IDLE
    this.processing = false;
    if (this.session.state === "SPEAKING") {
      this.session.stateMachine.transition("IDLE");
    }
  }

  stop(): void {
    this.stt.close();
    this.tts.flush();
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    const costs = this.costTracker.getSummary();
    console.log(
      `[pipeline] session=${this.session.sessionId} stopped after ${duration}s ` +
        `cost=$${costs.cost_usd} tokens=${costs.tokens_used} ` +
        `stt=${costs.audio_seconds_stt}s tts=${costs.audio_seconds_tts}s`
    );
    this.session.sendEvent("session_costs", costs);
  }
}
