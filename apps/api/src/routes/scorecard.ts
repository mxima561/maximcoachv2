import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createServiceClient } from "../lib/supabase.js";
import { updateEloRating } from "../lib/adaptive-difficulty.js";

// ── Scorecard category schema ─────────────────────────────────

const ScorecardCategorySchema = z.object({
  score: z.number().int().min(0).max(100),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  coaching_tip: z.string(),
});

const ScorecardOutputSchema = z.object({
  opening: ScorecardCategorySchema,
  discovery: ScorecardCategorySchema,
  objection_handling: ScorecardCategorySchema,
  closing: ScorecardCategorySchema,
  communication: ScorecardCategorySchema,
  coaching_text: z.string(),
});

type ScorecardOutput = z.infer<typeof ScorecardOutputSchema>;

// ── Scoring weights ───────────────────────────────────────────

const WEIGHTS = {
  opening: 0.15,
  discovery: 0.25,
  objection_handling: 0.25,
  closing: 0.2,
  communication: 0.15,
} as const;

function calculateOverallScore(scores: ScorecardOutput): number {
  const weighted =
    scores.opening.score * WEIGHTS.opening +
    scores.discovery.score * WEIGHTS.discovery +
    scores.objection_handling.score * WEIGHTS.objection_handling +
    scores.closing.score * WEIGHTS.closing +
    scores.communication.score * WEIGHTS.communication;
  return Math.round(weighted);
}

// ── Route registration ────────────────────────────────────────

const requestSchema = z.object({
  session_id: z.string().uuid(),
});

export async function scorecardRoutes(app: FastifyInstance) {
  app.post<{ Body: z.infer<typeof requestSchema> }>(
    "/api/scorecards/generate",
    async (request, reply) => {
      const parsed = requestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.format() });
      }

      const { session_id } = parsed.data;
      const supabase = createServiceClient();

      // Load session
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("id, user_id, org_id, scenario_type")
        .eq("id", session_id)
        .single();

      if (sessionError || !session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      // Load transcript
      const { data: transcript, error: transcriptError } = await supabase
        .from("transcripts")
        .select("messages")
        .eq("session_id", session_id)
        .single();

      if (transcriptError || !transcript) {
        return reply.status(404).send({ error: "Transcript not found" });
      }

      // Generate scorecard via Claude
      const messages = transcript.messages as Array<{
        role: string;
        content: string;
      }>;

      const conversationText = messages
        .map((m) => `${m.role === "user" ? "Sales Rep" : "Buyer"}: ${m.content}`)
        .join("\n");

      const { text } = await generateText({
        model: anthropic("claude-sonnet-4-20250514"),
        system: `You are an expert sales coach scoring a simulated sales conversation.
Score the sales rep across 5 categories (0-100 each). Be constructive but honest.
Respond with valid JSON matching the requested schema.`,
        prompt: `Score this ${session.scenario_type.replace("_", " ")} simulation transcript:

${conversationText}

Respond with a JSON object containing:
- opening: { score (0-100), strengths (string[]), improvements (string[]), coaching_tip (string) }
- discovery: { score (0-100), strengths (string[]), improvements (string[]), coaching_tip (string) }
- objection_handling: { score (0-100), strengths (string[]), improvements (string[]), coaching_tip (string) }
- closing: { score (0-100), strengths (string[]), improvements (string[]), coaching_tip (string) }
- communication: { score (0-100), strengths (string[]), improvements (string[]), coaching_tip (string) }
- coaching_text: A 2-3 paragraph overall coaching summary

Respond ONLY with the JSON object, no markdown fences.`,
        maxOutputTokens: 4096,
      });

      // Parse and validate
      let scores: ScorecardOutput;
      try {
        const raw = JSON.parse(text);
        scores = ScorecardOutputSchema.parse(raw);
      } catch {
        return reply
          .status(500)
          .send({ error: "Failed to generate valid scorecard" });
      }

      const overall = calculateOverallScore(scores);

      // Save scorecard
      const { data: scorecard, error: insertError } = await supabase
        .from("scorecards")
        .insert({
          session_id,
          user_id: session.user_id,
          org_id: session.org_id,
          scores: {
            opening: scores.opening,
            discovery: scores.discovery,
            objection_handling: scores.objection_handling,
            closing: scores.closing,
            communication: scores.communication,
          },
          overall_score: overall,
          coaching_text: scores.coaching_text,
        })
        .select("id, overall_score, scores, coaching_text")
        .single();

      if (insertError || !scorecard) {
        return reply
          .status(500)
          .send({ error: "Failed to save scorecard" });
      }

      // Update ELO rating based on session score
      const eloResult = await updateEloRating(session.user_id, overall).catch(
        () => null,
      );

      return reply.send({ ...scorecard, elo: eloResult });
    },
  );
}
