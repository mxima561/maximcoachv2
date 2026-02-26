export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface CoachingSuggestion {
  type: "suggestion";
  category: "objection" | "question" | "battlecard" | "sentiment";
  text: string;
  confidence: number;
}

export interface TranscriptUpdate {
  type: "transcript";
  speaker: "rep" | "prospect";
  text: string;
  timestamp: string;
}

export interface SentimentUpdate {
  type: "sentiment";
  score: number;
  label: "positive" | "neutral" | "negative";
}

export interface SessionConfig {
  coachUrl: string;
  authToken: string;
  orgId: string;
}

export type ServerMessage =
  | CoachingSuggestion
  | TranscriptUpdate
  | SentimentUpdate
  | { type: "connected"; session_id: string }
  | { type: "session_started"; session_id: string }
  | { type: "session_ended"; session_id: string }
  | { type: "session_costs"; [key: string]: unknown }
  | { type: "error"; message: string };
