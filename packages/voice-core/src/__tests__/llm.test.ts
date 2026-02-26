import { describe, it, expect } from "vitest";
import { filterByContextWindow } from "../llm.js";
import type { ConversationMessage } from "../types.js";

describe("filterByContextWindow", () => {
  const now = Date.now();

  function makeMessages(count: number, startMs = now - 60_000): ConversationMessage[] {
    return Array.from({ length: count }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `message ${i}`,
      timestamp: startMs + i * 1000,
    }));
  }

  it("returns all messages when no context window is set", () => {
    const messages = makeMessages(5);
    const result = filterByContextWindow(messages, 0, 100);
    expect(result).toHaveLength(5);
  });

  it("limits by maxTurns", () => {
    const messages = makeMessages(10);
    const result = filterByContextWindow(messages, 0, 3);
    expect(result).toHaveLength(3);
    // Should keep the LAST 3 messages
    expect(result[0].content).toBe("message 7");
    expect(result[2].content).toBe("message 9");
  });

  it("filters by time-based context window", () => {
    const messages: ConversationMessage[] = [
      { role: "user", content: "old", timestamp: now - 120_000 },
      { role: "assistant", content: "old reply", timestamp: now - 90_000 },
      { role: "user", content: "recent", timestamp: now - 5_000 },
      { role: "assistant", content: "recent reply", timestamp: now - 2_000 },
    ];

    // 30 second context window — should drop the first two messages
    const result = filterByContextWindow(messages, 30, 100);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("recent");
    expect(result[1].content).toBe("recent reply");
  });

  it("includes messages without timestamps when filtering by window", () => {
    const messages: ConversationMessage[] = [
      { role: "user", content: "no timestamp" },
      { role: "assistant", content: "old", timestamp: now - 120_000 },
      { role: "user", content: "recent", timestamp: now - 5_000 },
    ];

    const result = filterByContextWindow(messages, 30, 100);
    // Message without timestamp should be kept (no timestamp = no cutoff)
    // Old message should be dropped
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("no timestamp");
    expect(result[1].content).toBe("recent");
  });

  it("applies both context window and maxTurns", () => {
    const messages: ConversationMessage[] = [
      { role: "user", content: "old", timestamp: now - 120_000 },
      { role: "user", content: "a", timestamp: now - 10_000 },
      { role: "assistant", content: "b", timestamp: now - 8_000 },
      { role: "user", content: "c", timestamp: now - 5_000 },
      { role: "assistant", content: "d", timestamp: now - 2_000 },
    ];

    // 30s window keeps 4, maxTurns 2 keeps last 2
    const result = filterByContextWindow(messages, 30, 2);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("c");
    expect(result[1].content).toBe("d");
  });

  it("strips timestamp from output", () => {
    const messages: ConversationMessage[] = [
      { role: "user", content: "hello", timestamp: now },
    ];

    const result = filterByContextWindow(messages, 0, 10);
    expect(result[0]).toEqual({ role: "user", content: "hello" });
    expect("timestamp" in result[0]).toBe(false);
  });
});
