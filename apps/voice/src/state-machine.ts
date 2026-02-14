export const VOICE_STATES = [
  "IDLE",
  "LISTENING",
  "PROCESSING",
  "SPEAKING",
  "INTERRUPTION",
] as const;

export type VoiceState = (typeof VOICE_STATES)[number];

const VALID_TRANSITIONS: Record<VoiceState, VoiceState[]> = {
  IDLE: ["LISTENING"],
  LISTENING: ["PROCESSING", "IDLE"],
  PROCESSING: ["SPEAKING", "IDLE"],
  SPEAKING: ["IDLE", "INTERRUPTION"],
  INTERRUPTION: ["LISTENING"],
};

export type StateChangeHandler = (
  from: VoiceState,
  to: VoiceState
) => void;

export class VoiceStateMachine {
  private _state: VoiceState = "IDLE";
  private _listeners: StateChangeHandler[] = [];

  get state(): VoiceState {
    return this._state;
  }

  transition(to: VoiceState): boolean {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed.includes(to)) {
      console.warn(
        `[state-machine] invalid transition: ${this._state} -> ${to}`
      );
      return false;
    }
    const from = this._state;
    this._state = to;
    for (const listener of this._listeners) {
      listener(from, to);
    }
    return true;
  }

  onStateChange(handler: StateChangeHandler): () => void {
    this._listeners.push(handler);
    return () => {
      this._listeners = this._listeners.filter((h) => h !== handler);
    };
  }

  reset(): void {
    this._state = "IDLE";
    this._listeners = [];
  }
}
