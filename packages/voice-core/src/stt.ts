import {
  createClient,
  LiveTranscriptionEvents,
  type ListenLiveClient,
} from "@deepgram/sdk";
import type {
  TranscriptResult,
  TranscriptHandler,
  STTEventType,
  STTEventHandler,
  DeepgramSTTConfig,
  AudioChunk,
} from "./types.js";

const RECONNECT_DELAYS = [1000, 2000, 4000]; // exponential backoff
const MAX_BUFFER_SECONDS = 5;
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // 16-bit linear PCM
const MAX_BUFFER_BYTES = MAX_BUFFER_SECONDS * SAMPLE_RATE * BYTES_PER_SAMPLE;

const DEFAULT_CONFIG: Required<DeepgramSTTConfig> = {
  model: "nova-3",
  language: "en-US",
  encoding: "linear16",
  sampleRate: 16000,
  channels: 1,
  interimResults: true,
  utteranceEndMs: 500,
  endpointing: 500,
};

const PREWARM_IDLE_TIMEOUT_MS = 30_000;

export class DeepgramSTT {
  private connection: ListenLiveClient | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<STTEventType, STTEventHandler[]> = new Map();
  private onTranscript: TranscriptHandler;
  private config: Required<DeepgramSTTConfig>;
  private apiKey: string;
  private reconnectAttempt = 0;
  private isReconnecting = false;
  private audioBuffer: Uint8Array[] = [];
  private audioBufferSize = 0;
  private isClosed = false;
  private sessionId: string;
  private isPrewarmed = false;
  private prewarmTimestamp = 0;
  private prewarmIdleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    sessionId: string,
    onTranscript: TranscriptHandler,
    config?: DeepgramSTTConfig,
    apiKey?: string,
  ) {
    this.sessionId = sessionId;
    this.onTranscript = onTranscript;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.apiKey = apiKey ?? process.env.DEEPGRAM_API_KEY ?? "";
  }

  on(event: STTEventType, handler: STTEventHandler): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
  }

  private emit(event: STTEventType, data?: unknown): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const handler of handlers) {
      handler(data);
    }
  }

  /**
   * Pre-warm the Deepgram connection before audio starts flowing.
   * Returns a Promise that resolves when the connection is established.
   * If the connection sits idle for 30 seconds, it will be closed.
   */
  prewarm(): Promise<void> {
    if (!this.apiKey) {
      return Promise.reject(new Error("STT service not configured"));
    }

    return new Promise<void>((resolve, reject) => {
      this.isClosed = false;
      this.isPrewarmed = true;
      this.prewarmTimestamp = Date.now();

      // Listen for the open event to resolve
      const onOpen = () => {
        resolve();
      };
      const onError = (err: unknown) => {
        reject(err);
      };

      this.on("open", onOpen);
      this.on("error", onError);

      this.connectToDeepgram();

      // Set idle timeout — if no audio arrives within 30s, close and mark stale
      this.prewarmIdleTimer = setTimeout(() => {
        if (this.isPrewarmed && this.connection) {
          console.log(
            `[deepgram] session=${this.sessionId} pre-warmed connection idle timeout — closing`,
          );
          this.isPrewarmed = false;
          this.connection.requestClose();
          this.connection = null;
          this.clearKeepAlive();
        }
      }, PREWARM_IDLE_TIMEOUT_MS);
    });
  }

  start(): void {
    if (!this.apiKey) {
      console.error(
        `[deepgram] session=${this.sessionId} DEEPGRAM_API_KEY not set`,
      );
      this.emit("error", { message: "STT service not configured" });
      return;
    }
    this.isClosed = false;

    // If pre-warmed and connection is still alive, reuse it
    if (this.isPrewarmed && this.connection) {
      const idleTime = Date.now() - this.prewarmTimestamp;
      if (idleTime < PREWARM_IDLE_TIMEOUT_MS) {
        console.log(
          `[deepgram] session=${this.sessionId} reusing pre-warmed connection (idle ${idleTime}ms)`,
        );
        this.isPrewarmed = false;
        this.clearPrewarmTimer();
        return;
      }
      // Stale pre-warmed connection — close and create fresh
      console.log(
        `[deepgram] session=${this.sessionId} pre-warmed connection stale — creating fresh`,
      );
      this.connection.requestClose();
      this.connection = null;
      this.clearKeepAlive();
    }

    this.isPrewarmed = false;
    this.clearPrewarmTimer();
    this.connectToDeepgram();
  }

  private clearPrewarmTimer(): void {
    if (this.prewarmIdleTimer) {
      clearTimeout(this.prewarmIdleTimer);
      this.prewarmIdleTimer = null;
    }
  }

  private connectToDeepgram(): void {
    const deepgram = createClient(this.apiKey);

    this.connection = deepgram.listen.live({
      model: this.config.model,
      language: this.config.language,
      encoding: this.config.encoding,
      sample_rate: this.config.sampleRate,
      channels: this.config.channels,
      smart_format: true,
      interim_results: this.config.interimResults,
      utterance_end_ms: this.config.utteranceEndMs,
      endpointing: this.config.endpointing,
      punctuate: true,
    });

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log(
        `[deepgram] session=${this.sessionId} connection opened`,
      );

      const wasReconnecting = this.isReconnecting;
      this.reconnectAttempt = 0;
      this.isReconnecting = false;

      this.keepAliveTimer = setInterval(() => {
        this.connection?.keepAlive();
      }, 10_000);

      if (wasReconnecting && this.audioBuffer.length > 0) {
        console.log(
          `[deepgram] session=${this.sessionId} replaying ${this.audioBuffer.length} buffered chunks`,
        );
        for (const chunk of this.audioBuffer) {
          this.sendAudioDirect(chunk);
        }
        this.audioBuffer = [];
        this.audioBufferSize = 0;
        this.emit("reconnected");
      } else {
        this.emit("open");
      }
    });

    this.connection.on(
      LiveTranscriptionEvents.Transcript,
      (data: unknown) => {
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

        this.emit("transcript", transcriptResult);

        if (transcriptResult.isFinal) {
          this.onTranscript(transcriptResult);
        }
      },
    );

    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      console.log(
        `[deepgram] session=${this.sessionId} utterance end`,
      );
      this.emit("utterance_end");
    });

    this.connection.on(LiveTranscriptionEvents.SpeechStarted, () => {
      this.emit("speech_started");
    });

    this.connection.on(LiveTranscriptionEvents.Error, (err: unknown) => {
      console.error(
        `[deepgram] session=${this.sessionId} error`,
        err,
      );
      this.emit("error", err);
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log(
        `[deepgram] session=${this.sessionId} connection closed`,
      );
      this.clearKeepAlive();

      if (!this.isClosed) {
        this.attemptReconnect();
      } else {
        this.emit("close");
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempt >= RECONNECT_DELAYS.length) {
      console.error(
        `[deepgram] session=${this.sessionId} max reconnect attempts exhausted`,
      );
      this.audioBuffer = [];
      this.audioBufferSize = 0;
      this.isReconnecting = false;
      this.emit("degraded");
      return;
    }

    this.isReconnecting = true;
    const delay = RECONNECT_DELAYS[this.reconnectAttempt];
    console.log(
      `[deepgram] session=${this.sessionId} reconnecting in ${delay}ms (attempt ${this.reconnectAttempt + 1}/${RECONNECT_DELAYS.length})`,
    );

    this.reconnectAttempt++;
    setTimeout(() => {
      if (this.isClosed) return;
      this.connectToDeepgram();
    }, delay);
  }

  sendAudio(audio: AudioChunk): void {
    if (this.isReconnecting) {
      if (this.audioBufferSize + audio.byteLength <= MAX_BUFFER_BYTES) {
        this.audioBuffer.push(new Uint8Array(audio));
        this.audioBufferSize += audio.byteLength;
      }
      return;
    }
    this.sendAudioDirect(audio);
  }

  private sendAudioDirect(audio: AudioChunk): void {
    if (this.connection) {
      const ab = audio.buffer.slice(
        audio.byteOffset,
        audio.byteOffset + audio.byteLength,
      );
      this.connection.send(ab);
    }
  }

  private clearKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  close(): void {
    this.isClosed = true;
    this.isReconnecting = false;
    this.isPrewarmed = false;
    this.audioBuffer = [];
    this.audioBufferSize = 0;
    this.clearKeepAlive();
    this.clearPrewarmTimer();
    if (this.connection) {
      this.connection.requestClose();
      this.connection = null;
    }
  }
}
