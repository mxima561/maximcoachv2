import { describe, it, expect, vi } from "vitest";
import { VoiceStateMachine } from "../state-machine.js";

describe("VoiceStateMachine", () => {
  it("starts in IDLE state", () => {
    const sm = new VoiceStateMachine();
    expect(sm.state).toBe("IDLE");
  });

  it("allows valid transitions", () => {
    const sm = new VoiceStateMachine();
    expect(sm.transition("LISTENING")).toBe(true);
    expect(sm.state).toBe("LISTENING");

    expect(sm.transition("PROCESSING")).toBe(true);
    expect(sm.state).toBe("PROCESSING");

    expect(sm.transition("SPEAKING")).toBe(true);
    expect(sm.state).toBe("SPEAKING");
  });

  it("rejects invalid transitions", () => {
    const sm = new VoiceStateMachine();
    // IDLE -> SPEAKING is not valid
    expect(sm.transition("SPEAKING")).toBe(false);
    expect(sm.state).toBe("IDLE");
  });

  it("allows SPEAKING -> INTERRUPTION -> LISTENING", () => {
    const sm = new VoiceStateMachine();
    sm.transition("LISTENING");
    sm.transition("PROCESSING");
    sm.transition("SPEAKING");
    expect(sm.transition("INTERRUPTION")).toBe(true);
    expect(sm.transition("LISTENING")).toBe(true);
    expect(sm.state).toBe("LISTENING");
  });

  it("allows returning to IDLE from LISTENING", () => {
    const sm = new VoiceStateMachine();
    sm.transition("LISTENING");
    expect(sm.transition("IDLE")).toBe(true);
    expect(sm.state).toBe("IDLE");
  });

  it("notifies listeners on state change", () => {
    const sm = new VoiceStateMachine();
    const handler = vi.fn();
    sm.onStateChange(handler);

    sm.transition("LISTENING");
    expect(handler).toHaveBeenCalledWith("IDLE", "LISTENING");
  });

  it("does not notify on invalid transition", () => {
    const sm = new VoiceStateMachine();
    const handler = vi.fn();
    sm.onStateChange(handler);

    sm.transition("SPEAKING"); // invalid from IDLE
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns unsubscribe function from onStateChange", () => {
    const sm = new VoiceStateMachine();
    const handler = vi.fn();
    const unsubscribe = sm.onStateChange(handler);

    sm.transition("LISTENING");
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    sm.transition("IDLE");
    expect(handler).toHaveBeenCalledTimes(1); // not called again
  });

  it("resets state and listeners", () => {
    const sm = new VoiceStateMachine();
    const handler = vi.fn();
    sm.onStateChange(handler);
    sm.transition("LISTENING");

    sm.reset();
    expect(sm.state).toBe("IDLE");

    // listener should be cleared
    sm.transition("LISTENING");
    expect(handler).toHaveBeenCalledTimes(1); // only the first call
  });
});
