"use client";

import { useEffect, useRef } from "react";

export interface TranscriptMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  interim?: boolean;
}

interface SimulationTranscriptProps {
  messages: TranscriptMessage[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function SimulationTranscript({ messages }: SimulationTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Transcript</h3>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Conversation will appear here...
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
                  : "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100"
              } ${msg.interim ? "animate-pulse opacity-70" : ""}`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p
                className={`mt-1 text-[10px] ${
                  msg.role === "user"
                    ? "text-indigo-400"
                    : "text-gray-400"
                }`}
              >
                {formatTime(msg.timestamp)}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
