/** Coaching suggestion categories */
export type SuggestionCategory =
  | "objection"
  | "question"
  | "battlecard"
  | "sentiment";

/** Coaching suggestion sent to the client */
export interface CoachingSuggestion {
  type: "suggestion";
  category: SuggestionCategory;
  text: string;
  confidence: number;
}

/** Transcript update sent to the client */
export interface TranscriptUpdate {
  type: "transcript";
  speaker: "rep" | "prospect";
  text: string;
  timestamp: string;
}

/** Sentiment update sent to the client */
export interface SentimentUpdate {
  type: "sentiment";
  score: number;
  label: "positive" | "neutral" | "negative";
}

/** Sentiment timeline entry for post-session insights */
export interface SentimentEntry {
  timestamp: string;
  score: number;
  label: "positive" | "neutral" | "negative";
}

/** Coaching insights saved at session end */
export interface CoachingInsightData {
  session_id: string;
  org_id: string;
  sentiment_timeline: SentimentEntry[];
  talk_ratio: number;
  topics_covered: string[];
  topics_missed: string[];
  suggestions_surfaced: number;
  battle_cards_triggered: number;
  overall_sentiment: "positive" | "neutral" | "negative";
}

/** Control message from client */
export interface ClientMessage {
  type: "start_session" | "end_session";
  org_id?: string;
  [key: string]: unknown;
}
