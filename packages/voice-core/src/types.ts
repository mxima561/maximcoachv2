/** Raw audio chunk from client microphone or file */
export type AudioChunk = Buffer | Uint8Array;

/** Result from speech-to-text transcription */
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

/** Handler called when a final transcript is ready */
export type TranscriptHandler = (result: TranscriptResult) => void;

/** Events emitted by the STT module */
export type STTEventType =
  | "open"
  | "transcript"
  | "speech_started"
  | "utterance_end"
  | "error"
  | "close"
  | "degraded"
  | "reconnected";

export type STTEventHandler = (data?: unknown) => void;

/** Configuration for Deepgram STT connection */
export interface DeepgramSTTConfig {
  model?: string;
  language?: string;
  encoding?: string;
  sampleRate?: number;
  channels?: number;
  interimResults?: boolean;
  utteranceEndMs?: number;
  endpointing?: number;
}

/** Configuration for LLM runner */
export interface LLMConfig {
  model?: string;
  maxTokens?: number;
  maxRetries?: number;
  maxHistoryTurns?: number;
  /** Number of seconds of context to include (undefined = unlimited) */
  contextWindow?: number;
}

/** A single turn in a conversation */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

/** Voice pipeline state */
export const VOICE_STATES = [
  "IDLE",
  "LISTENING",
  "PROCESSING",
  "SPEAKING",
  "INTERRUPTION",
] as const;

export type VoiceState = (typeof VOICE_STATES)[number];

/** Handler for state change events */
export type StateChangeHandler = (from: VoiceState, to: VoiceState) => void;

/** Summary of costs for a voice session */
export interface CostSummary {
  tokens_used: number;
  audio_seconds_stt: number;
  audio_seconds_tts: number;
  cost_usd: number;
}
