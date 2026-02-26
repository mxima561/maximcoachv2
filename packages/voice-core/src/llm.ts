import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { LLMConfig, ConversationMessage } from "./types.js";

const DEFAULT_CONFIG: Required<LLMConfig> = {
  model: "gpt-4o",
  maxTokens: 1024,
  maxRetries: 2,
  maxHistoryTurns: 20,
  contextWindow: 0, // 0 = unlimited
};

export type SentenceHandler = (sentence: string) => void;

/**
 * Filter conversation messages to a sliding context window.
 * If contextWindow is 0 or undefined, returns all messages (up to maxTurns).
 */
export function filterByContextWindow(
  messages: ConversationMessage[],
  contextWindowSeconds: number,
  maxTurns: number,
): Array<{ role: "user" | "assistant"; content: string }> {
  let filtered = messages;

  // Apply context window (time-based filtering)
  if (contextWindowSeconds > 0) {
    const cutoff = Date.now() - contextWindowSeconds * 1000;
    filtered = messages.filter(
      (m) => !m.timestamp || m.timestamp >= cutoff,
    );
  }

  // Apply max turns limit
  return filtered.slice(-maxTurns).map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

/**
 * Generate a streaming LLM response.
 * Calls onSentence for each complete sentence detected in the stream.
 */
export async function generateLLMResponse(
  systemPrompt: string,
  messages: ConversationMessage[],
  onSentence: SentenceHandler,
  config?: LLMConfig,
): Promise<string> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const filteredMessages = filterByContextWindow(
    messages,
    cfg.contextWindow,
    cfg.maxHistoryTurns,
  );

  const { textStream } = streamText({
    model: openai(cfg.model),
    system: systemPrompt,
    messages: filteredMessages,
    maxOutputTokens: cfg.maxTokens,
    maxRetries: cfg.maxRetries,
  });

  let fullResponse = "";
  let sentenceBuffer = "";

  for await (const chunk of textStream) {
    fullResponse += chunk;
    sentenceBuffer += chunk;

    // Extract all complete sentences from the buffer
    let sentenceEnd: number;
    while ((sentenceEnd = sentenceBuffer.search(/[.!?]\s/)) !== -1) {
      const sentence = sentenceBuffer.slice(0, sentenceEnd + 1).trim();
      sentenceBuffer = sentenceBuffer.slice(sentenceEnd + 2);
      if (sentence) {
        onSentence(sentence);
      }
    }
  }

  // Flush remaining buffer
  const remaining = sentenceBuffer.trim();
  if (remaining) {
    onSentence(remaining);
  }

  return fullResponse;
}
