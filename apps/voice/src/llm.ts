import { generateLLMResponse } from "@maxima/voice-core";
import type { SentenceHandler } from "@maxima/voice-core";
import type { VoiceSession, ConversationTurn } from "./session.js";

export type { SentenceHandler };

const MAX_HISTORY_TURNS = 20;

export interface PersonaConfig {
  name: string;
  title: string;
  company: string;
  personality: string;
  background: string;
  objections: string[];
  communication_style: string;
}

export interface ScenarioConfig {
  type: "cold_call" | "discovery" | "objection_handling" | "closing";
  context: string;
  objectives: string[];
}

export interface DifficultyParams {
  pushback_level: number;
  question_complexity: number;
  objection_frequency: number;
  detail_demand: number;
  patience_level: number;
  decision_readiness: number;
}

function buildSystemPrompt(
  persona: PersonaConfig,
  scenario: ScenarioConfig,
  difficulty: DifficultyParams,
): string {
  return `You are ${persona.name}, ${persona.title} at ${persona.company}.

PERSONALITY: ${persona.personality}
BACKGROUND: ${persona.background}
COMMUNICATION STYLE: ${persona.communication_style}

SCENARIO: ${scenario.type.replace(/_/g, " ")}
CONTEXT: ${scenario.context}
OBJECTIVES FOR THE REP: ${scenario.objectives.join(", ")}

KNOWN OBJECTIONS YOU MAY RAISE:
${persona.objections.map((o) => `- ${o}`).join("\n")}

DIFFICULTY PARAMETERS:
- Pushback level: ${difficulty.pushback_level}/10
- Question complexity: ${difficulty.question_complexity}/10
- Objection frequency: ${difficulty.objection_frequency}/10
- Detail demand: ${difficulty.detail_demand}/10
- Patience level: ${difficulty.patience_level}/10
- Decision readiness: ${difficulty.decision_readiness}/10

RULES:
1. Stay in character at all times. You are the BUYER, not the seller.
2. Respond naturally and conversationally — keep responses concise (1-3 sentences typically).
3. React authentically to the sales rep's approach.
4. Raise objections organically based on the difficulty parameters.
5. If the rep does well, gradually warm up. If they struggle, maintain resistance proportional to pushback level.
6. Never break character or provide coaching during the simulation.
7. Use filler words and natural speech patterns occasionally.`;
}

function historyToMessages(
  history: ConversationTurn[],
): Array<{ role: "user" | "assistant"; content: string; timestamp?: number }> {
  return history.slice(-MAX_HISTORY_TURNS).map((turn) => ({
    role: turn.role,
    content: turn.content,
    timestamp: turn.timestamp,
  }));
}

export async function generateResponse(
  session: VoiceSession,
  userMessage: string,
  persona: PersonaConfig,
  scenario: ScenarioConfig,
  difficulty: DifficultyParams,
  onSentence: SentenceHandler,
): Promise<string> {
  session.addTurn("user", userMessage);

  const systemPrompt = buildSystemPrompt(persona, scenario, difficulty);
  const messages = historyToMessages(
    session.getRecentHistory(MAX_HISTORY_TURNS),
  );

  const fullResponse = await generateLLMResponse(
    systemPrompt,
    messages,
    onSentence,
    { model: "gpt-4o", maxTokens: 1024, maxRetries: 2 },
  );

  session.addTurn("assistant", fullResponse);
  return fullResponse;
}
