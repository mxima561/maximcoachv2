import {
  createClient,
  LiveTranscriptionEvents,
  type ListenLiveClient,
} from "@deepgram/sdk";
import type { VoiceSession } from "./session.js";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY ?? "";

export interface TranscriptResult {
  transcript: string;
  isFinal: boolean;
  confidence: number;
  words: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

export type TranscriptHandler = (result: TranscriptResult) => void;

export class DeepgramSTT {
  private connection: ListenLiveClient | null = null;
  private session: VoiceSession;
  private onTranscript: TranscriptHandler;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(session: VoiceSession, onTranscript: TranscriptHandler) {
    this.session = session;
    this.onTranscript = onTranscript;
  }

  start(): void {
    if (!DEEPGRAM_API_KEY) {
      console.error(`[deepgram] session=${this.session.sessionId} DEEPGRAM_API_KEY not set`);
      this.session.sendEvent("error", { message: "STT service not configured" });
      return;
    }
    const deepgram = createClient(DEEPGRAM_API_KEY);

    this.connection = deepgram.listen.live({
      model: "nova-3",
      language: "en-US",
      encoding: "linear16",
      sample_rate: 16000,
      channels: 1,
      smart_format: true,
      interim_results: true,
      utterance_end_ms: 500,
      endpointing: 500,
      punctuate: true,
    });

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log(
        `[deepgram] session=${this.session.sessionId} connection opened`
      );

      // Send keepalive every 10s to prevent timeout
      this.keepAliveTimer = setInterval(() => {
        this.connection?.keepAlive();
      }, 10_000);
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data: unknown) => {
      const result = data as {
        is_final: boolean;
        speech_final: boolean;
        channel: {
          alternatives: Array<{
            transcript: string;
            confidence: number;
            words: Array<{
              word: string;
              start: number;
              end: number;
              confidence: number;
            }>;
          }>;
        };
      };

      const alt = result.channel?.alternatives?.[0];
      if (!alt || !alt.transcript) return;

      const transcriptResult: TranscriptResult = {
        transcript: alt.transcript,
        isFinal: result.is_final,
        confidence: alt.confidence,
        words: alt.words ?? [],
      };

      // Forward interim results to client for real-time display
      this.session.sendEvent("transcript", {
        text: transcriptResult.transcript,
        is_final: transcriptResult.isFinal,
        confidence: transcriptResult.confidence,
      });

      // Only call handler on final results
      if (transcriptResult.isFinal) {
        this.onTranscript(transcriptResult);
      }
    });

    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      console.log(
        `[deepgram] session=${this.session.sessionId} utterance end`
      );
    });

    this.connection.on(LiveTranscriptionEvents.SpeechStarted, () => {
      this.session.sendEvent("speech_started", {});
    });

    this.connection.on(LiveTranscriptionEvents.Error, (err: unknown) => {
      console.error(
        `[deepgram] session=${this.session.sessionId} error`,
        err
      );
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log(
        `[deepgram] session=${this.session.sessionId} connection closed`
      );
    });
  }

  sendAudio(audio: Buffer | Uint8Array): void {
    if (this.connection) {
      // Convert to ArrayBuffer for Deepgram SDK compatibility
      const ab = audio.buffer.slice(
        audio.byteOffset,
        audio.byteOffset + audio.byteLength
      );
      this.connection.send(ab);
    }
  }

  close(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.connection) {
      this.connection.requestClose();
      this.connection = null;
    }
  }
}
