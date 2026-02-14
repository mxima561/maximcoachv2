import type { WebSocket } from "ws";
import { VoiceStateMachine, type VoiceState } from "./state-machine.js";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  interrupted?: boolean;
}

export class VoiceSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly ws: WebSocket;
  readonly stateMachine: VoiceStateMachine;
  readonly history: ConversationTurn[] = [];
  readonly createdAt: number;

  private cleanupCallbacks: (() => void)[] = [];

  constructor(sessionId: string, userId: string, ws: WebSocket) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.ws = ws;
    this.stateMachine = new VoiceStateMachine();
    this.createdAt = Date.now();

    const unsubscribe = this.stateMachine.onStateChange((from, to) => {
      this.sendEvent("state_change", { from, to, state: to });
    });
    this.cleanupCallbacks.push(unsubscribe);
  }

  get state(): VoiceState {
    return this.stateMachine.state;
  }

  addTurn(role: "user" | "assistant", content: string, interrupted = false): void {
    this.history.push({
      role,
      content,
      timestamp: Date.now(),
      interrupted,
    });
  }

  getRecentHistory(maxTurns = 20): ConversationTurn[] {
    return this.history.slice(-maxTurns);
  }

  sendEvent(type: string, data: Record<string, unknown>): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }));
    }
  }

  sendBinary(data: Buffer | Uint8Array): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(data, { binary: true });
    }
  }

  cleanup(): void {
    for (const cb of this.cleanupCallbacks) {
      cb();
    }
    this.cleanupCallbacks = [];
    this.stateMachine.reset();
  }
}
