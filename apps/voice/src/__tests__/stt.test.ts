import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TranscriptResult } from "../stt.js";

// Set env BEFORE module imports
process.env.DEEPGRAM_API_KEY = "test-key";

// Mock the Deepgram SDK before importing STT
const mockConnection = {
  on: vi.fn(),
  send: vi.fn(),
  keepAlive: vi.fn(),
  requestClose: vi.fn(),
};

const mockLiveFn = vi.fn(() => mockConnection);

vi.mock("@deepgram/sdk", () => ({
  createClient: () => ({
    listen: { live: mockLiveFn },
  }),
  LiveTranscriptionEvents: {
    Open: "open",
    Transcript: "Transcript",
    UtteranceEnd: "UtteranceEnd",
    SpeechStarted: "SpeechStarted",
    Error: "error",
    Close: "close",
  },
}));

const { DeepgramSTT } = await import("../stt.js");

describe("DeepgramSTT", () => {
  let stt: InstanceType<typeof DeepgramSTT>;
  let onTranscript: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockConnection.on.mockReset();
    mockConnection.send.mockReset();
    mockConnection.keepAlive.mockReset();
    mockConnection.requestClose.mockReset();
    mockLiveFn.mockClear();

    onTranscript = vi.fn();
    stt = new DeepgramSTT("test-session", onTranscript as (result: TranscriptResult) => void);
  });

  afterEach(() => {
    stt.close();
    vi.useRealTimers();
  });

  function getEventHandler(eventName: string) {
    const call = mockConnection.on.mock.calls.find(
      (args: unknown[]) => args[0] === eventName,
    );
    return call?.[1] as ((...args: unknown[]) => void) | undefined;
  }

  function triggerOpen() {
    const handler = getEventHandler("open");
    handler?.();
  }

  it("creates a Deepgram connection on start()", () => {
    stt.start();
    expect(mockLiveFn).toHaveBeenCalledTimes(1);
  });

  it("forwards audio to Deepgram connection", () => {
    stt.start();
    triggerOpen();

    const audio = new Uint8Array([1, 2, 3, 4]);
    stt.sendAudio(audio);

    expect(mockConnection.send).toHaveBeenCalledTimes(1);
  });

  it("calls onTranscript for final results only", () => {
    stt.start();
    triggerOpen();

    const transcriptHandler = getEventHandler("Transcript");
    expect(transcriptHandler).toBeDefined();

    // Interim result — should NOT call onTranscript
    transcriptHandler?.({
      is_final: false,
      speech_final: false,
      channel: {
        alternatives: [
          { transcript: "hello", confidence: 0.9, words: [] },
        ],
      },
    });
    expect(onTranscript).not.toHaveBeenCalled();

    // Final result — SHOULD call onTranscript
    transcriptHandler?.({
      is_final: true,
      speech_final: true,
      channel: {
        alternatives: [
          { transcript: "hello world", confidence: 0.95, words: [] },
        ],
      },
    });
    expect(onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: "hello world",
        isFinal: true,
        confidence: 0.95,
      }),
    );
  });

  it("buffers audio during reconnection and replays on reconnect", () => {
    stt.start();
    triggerOpen();

    // Simulate connection close (triggers reconnect)
    const closeHandler = getEventHandler("close");
    closeHandler?.();

    // Audio sent during reconnection should be buffered
    const audio1 = new Uint8Array([1, 2, 3, 4]);
    const audio2 = new Uint8Array([5, 6, 7, 8]);
    stt.sendAudio(audio1);
    stt.sendAudio(audio2);

    // send should not be called during reconnection (beyond initial open)
    const sendCallsBefore = mockConnection.send.mock.calls.length;

    // Advance timer to trigger reconnect (1s delay)
    vi.advanceTimersByTime(1000);

    // New connection created
    expect(mockLiveFn).toHaveBeenCalledTimes(2);

    // Trigger open on new connection — buffered audio should replay
    const newOpenHandler = getEventHandler("open");
    newOpenHandler?.();

    // Should have sent the 2 buffered chunks
    expect(mockConnection.send.mock.calls.length).toBe(sendCallsBefore + 2);
  });

  it("emits degraded after max reconnect attempts exhausted", () => {
    const degradedHandler = vi.fn();
    stt.on("degraded", degradedHandler);

    stt.start();
    triggerOpen();

    // Simulate 3 connection drops + reconnect failures
    for (let i = 0; i < 3; i++) {
      const closeHandler = getEventHandler("close");
      closeHandler?.();

      // Advance past the reconnect delay
      const delay = [1000, 2000, 4000][i];
      vi.advanceTimersByTime(delay!);

      // New connection is created but immediately closes again
      // (simulating persistent failure)
    }

    // After 3 failed attempts, the next close should emit degraded
    const closeHandler = getEventHandler("close");
    closeHandler?.();

    expect(degradedHandler).toHaveBeenCalledTimes(1);
  });

  it("does not reconnect after close() is called", () => {
    stt.start();
    triggerOpen();

    const initialCalls = mockLiveFn.mock.calls.length;

    // Intentionally close
    stt.close();

    // Should not reconnect
    vi.advanceTimersByTime(5000);
    expect(mockLiveFn.mock.calls.length).toBe(initialCalls);
  });

  it("prewarm opens connection and resolves on open", async () => {
    const prewarmPromise = stt.prewarm();

    // Should create a connection
    expect(mockLiveFn).toHaveBeenCalledTimes(1);

    // Trigger open to resolve the promise
    triggerOpen();
    await expect(prewarmPromise).resolves.toBeUndefined();
  });

  it("start() reuses pre-warmed connection", async () => {
    const prewarmPromise = stt.prewarm();
    triggerOpen();
    await prewarmPromise;

    const callsBefore = mockLiveFn.mock.calls.length;

    // start() should NOT create a new connection — reuses pre-warmed one
    stt.start();
    expect(mockLiveFn.mock.calls.length).toBe(callsBefore);
  });

  it("creates fresh connection if pre-warmed connection idle too long", async () => {
    const prewarmPromise = stt.prewarm();
    triggerOpen();
    await prewarmPromise;

    // Advance past the 30-second idle timeout
    vi.advanceTimersByTime(31_000);

    // Pre-warmed connection should be closed
    expect(mockConnection.requestClose).toHaveBeenCalled();

    // start() should create a new connection
    const callsBefore = mockLiveFn.mock.calls.length;
    stt.start();
    expect(mockLiveFn.mock.calls.length).toBe(callsBefore + 1);
  });

  it("emits reconnected event on successful reconnection", () => {
    const reconnectedHandler = vi.fn();
    stt.on("reconnected", reconnectedHandler);

    stt.start();
    triggerOpen();

    // Simulate connection drop
    const closeHandler = getEventHandler("close");
    closeHandler?.();

    // Buffer some audio
    stt.sendAudio(new Uint8Array([1, 2]));

    // Advance past reconnect delay
    vi.advanceTimersByTime(1000);

    // Trigger open on new connection
    const openHandler = getEventHandler("open");
    openHandler?.();

    expect(reconnectedHandler).toHaveBeenCalledTimes(1);
  });
});
