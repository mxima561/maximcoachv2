import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createServiceClient } from "../lib/supabase.js";
import { getValkey } from "../lib/valkey.js";
import {
  buildDifficultyPromptSection,
  getUserDifficulty,
} from "../lib/adaptive-difficulty.js";

// ── Persona output schema ─────────────────────────────────────

const PersonaOutputSchema = z.object({
  personality_traits: z
    .array(z.string())
    .describe("3-5 personality traits of this buyer persona"),
  communication_style: z
    .string()
    .describe(
      "How this person communicates: direct, analytical, expressive, etc.",
    ),
  likely_objections: z
    .array(z.string())
    .describe("3-5 objections they would raise during a sales call"),
  pain_points: z
    .array(z.string())
    .describe("2-4 business pain points they experience"),
  decision_criteria: z
    .array(z.string())
    .describe("Key factors they consider when making purchasing decisions"),
  emotional_state: z
    .string()
    .describe(
      "Their current emotional disposition: stressed, curious, skeptical, etc.",
    ),
  time_pressure_level: z
    .enum(["low", "medium", "high"])
    .describe("How urgently they need a solution"),
  background_summary: z
    .string()
    .describe(
      "Brief 2-3 sentence summary of who this person is professionally",
    ),
});

export type PersonaOutput = z.infer<typeof PersonaOutputSchema>;

// ── Cache helpers ─────────────────────────────────────────────

const CACHE_TTL = 60 * 60 * 24; // 24 hours
const cacheKey = (leadId: string) => `persona:${leadId}`;

// ── Route registration ────────────────────────────────────────

const requestSchema = z.object({
  lead_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  difficulty_level: z.number().int().min(1).max(10).optional().default(5),
});

export async function personaRoutes(app: FastifyInstance) {
  app.post<{ Body: z.infer<typeof requestSchema> }>(
    "/api/personas/generate",
    async (request, reply) => {
      const parsed = requestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.format() });
      }

      const { lead_id, user_id, difficulty_level } = parsed.data;
      const supabase = createServiceClient();

      // If user_id provided, derive difficulty from their ELO rating
      let effectiveDifficulty = difficulty_level;
      let eloRating: number | undefined;
      if (user_id) {
        const userDiff = await getUserDifficulty(user_id);
        eloRating = userDiff.rating;
        // Map ELO to 1-10 scale: 100=1, 1000=5, 1900=10
        effectiveDifficulty = Math.max(
          1,
          Math.min(10, Math.round((userDiff.rating - 100) / 200) + 1),
        );
      }

      // Check Valkey cache first
      const valkey = getValkey();
      const cached = await valkey.get(cacheKey(lead_id)).catch(() => null);
      if (cached) {
        const cachedPersona = JSON.parse(cached) as {
          id: string;
          persona_json: PersonaOutput;
        };
        return reply.send(cachedPersona);
      }

      // Fetch lead data
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", lead_id)
        .single();

      if (leadError || !lead) {
        return reply.status(404).send({ error: "Lead not found" });
      }

      // Generate persona via Claude Sonnet 4.5
      const difficultySection = eloRating
        ? buildDifficultyPromptSection(eloRating)
        : "";
      const prompt = buildPrompt(lead, effectiveDifficulty, difficultySection);

      const { text } = await generateText({
        model: anthropic("claude-sonnet-4-5-20250929"),
        system:
          "You are an expert sales training persona generator. Generate realistic buyer personas based on lead data. Always respond with valid JSON matching the requested schema.",
        prompt,
        maxOutputTokens: 2048,
      });

      // Parse and validate the output
      let personaJson: PersonaOutput;
      try {
        const raw = JSON.parse(text);
        personaJson = PersonaOutputSchema.parse(raw);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to generate valid persona" });
      }

      // Save to personas table
      const { data: persona, error: insertError } = await supabase
        .from("personas")
        .insert({
          lead_id,
          org_id: lead.org_id,
          persona_json: personaJson,
          difficulty_level,
        })
        .select("id, persona_json")
        .single();

      if (insertError || !persona) {
        return reply
          .status(500)
          .send({ error: "Failed to save persona" });
      }

      // Cache in Valkey
      await valkey
        .set(cacheKey(lead_id), JSON.stringify(persona), "EX", CACHE_TTL)
        .catch(() => {});

      return reply.send(persona);
    },
  );
}

// ── Prompt builder ────────────────────────────────────────────

function buildPrompt(
  lead: Record<string, unknown>,
  difficulty: number,
  adaptiveDifficultySection?: string,
): string {
  const difficultyDesc =
    difficulty <= 3
      ? "relatively easy to convince — open-minded and receptive"
      : difficulty <= 6
        ? "moderately challenging — has concerns but is willing to listen"
        : "very tough — highly skeptical, pushes back hard on everything";

  return `Generate a realistic buyer persona for this lead. The persona should be at difficulty level ${difficulty}/10 (${difficultyDesc}).

Lead data:
- Name: ${lead.name}
- Company: ${lead.company}
- Title: ${lead.title || "Unknown"}
- Industry: ${lead.industry || "Unknown"}
${lead.data_json ? `- Additional context: ${JSON.stringify(lead.data_json)}` : ""}

Respond with a JSON object containing these fields:
- personality_traits: array of 3-5 personality traits
- communication_style: how they communicate (e.g. "direct and analytical")
- likely_objections: array of 3-5 realistic objections they would raise
- pain_points: array of 2-4 business pain points
- decision_criteria: array of key purchasing decision factors
- emotional_state: current disposition (e.g. "skeptical but curious")
- time_pressure_level: "low", "medium", or "high"
- background_summary: 2-3 sentence professional summary

Make the persona feel realistic and grounded in the lead's industry and role. The objections should be specific to their context, not generic.
${adaptiveDifficultySection || ""}
Respond ONLY with the JSON object, no markdown fences or extra text.`;
}
