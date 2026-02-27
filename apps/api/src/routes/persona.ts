import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createServiceClient } from "../lib/supabase.js";
import { getValkey } from "../lib/valkey.js";
import {
  buildDifficultyPromptSection,
  getUserDifficulty,
} from "../lib/adaptive-difficulty.js";
import { requireAuth, requireOrgMembership } from "../lib/auth.js";
import { sendValidationError } from "../lib/http-errors.js";

// ── Persona output schema ─────────────────────────────────────

const PersonaOutputSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  company: z.string().optional(),
  tone: z.string().optional(),
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

type PersonaOutput = z.infer<typeof PersonaOutputSchema>;

type ScenarioType = "cold_call" | "discovery" | "objection_handling" | "closing";

type LeadRow = {
  id: string;
  org_id: string;
  name: string;
  company: string;
  title: string | null;
  industry: string | null;
  data_json: Record<string, unknown> | null;
};

// ── Cache helpers ─────────────────────────────────────────────

const CACHE_TTL = 60 * 60 * 24; // 24 hours
const cacheKey = (seed: string, difficulty: number) =>
  `persona:${seed}:d${difficulty}`;

const ScenarioTypeSchema = z.enum([
  "cold_call",
  "discovery",
  "objection_handling",
  "closing",
]);

const ProspectProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  company: z.string().trim().min(1).max(140).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  industry: z.string().trim().min(1).max(120).optional(),
  primary_challenge: z.string().trim().min(1).max(600).optional(),
});

const requestSchema = z
  .object({
    lead_id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    scenario_type: ScenarioTypeSchema.optional(),
    prospect_profile: ProspectProfileSchema.optional(),
    difficulty_level: z.number().int().min(1).max(10).optional().default(5),
  })
  .superRefine((value, ctx) => {
    if (!value.lead_id && !value.scenario_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scenario_type"],
        message: "Provide either lead_id or scenario_type",
      });
    }
  });

export async function personaRoutes(app: FastifyInstance) {
  async function handleGeneratePersona(
    request: FastifyRequest<{ Body: z.infer<typeof requestSchema> }>,
    reply: FastifyReply,
  ) {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    const { lead_id, user_id, scenario_type, prospect_profile, difficulty_level } =
      parsed.data;

    if (user_id && user_id !== auth.userId) {
      return reply.status(403).send({
        code: "FORBIDDEN",
        message: "Cannot generate persona for a different user",
      });
    }

    const supabase = createServiceClient();
    let lead: LeadRow | null = null;
    let cacheSeed = lead_id ?? "scenario";

    if (lead_id) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, org_id, name, company, title, industry, data_json")
        .eq("id", lead_id)
        .maybeSingle();

      if (error || !data) {
        return reply.status(404).send({
          code: "NOT_FOUND",
          message: "Lead not found",
        });
      }

      const membership = await requireOrgMembership(reply, data.org_id, auth.userId);
      if (!membership) return;

      lead = data;
      cacheSeed = data.id;
    } else {
      const { data: orgUser, error: orgError } = await supabase
        .from("organization_users")
        .select("organization_id")
        .eq("user_id", auth.userId)
        .limit(1)
        .maybeSingle();

      if (orgError || !orgUser?.organization_id) {
        return reply.status(403).send({
          code: "FORBIDDEN",
          message: "You must belong to an organization",
        });
      }

      const syntheticLead = buildSyntheticLead(
        orgUser.organization_id,
        scenario_type as ScenarioType,
        prospect_profile,
      );

      const { data, error } = await supabase
        .from("leads")
        .insert(syntheticLead)
        .select("id, org_id, name, company, title, industry, data_json")
        .single();

      if (error || !data) {
        return reply.status(500).send({
          code: "LEAD_CREATE_FAILED",
          message: "Failed to prepare simulation context",
        });
      }

      lead = data;
      cacheSeed = `${scenario_type}:${lead.company}:${lead.title ?? ""}`;
    }

    let effectiveDifficulty = difficulty_level;
    let eloRating: number | undefined;
    const userDifficulty = await getUserDifficulty(auth.userId);
    eloRating = userDifficulty.rating;
    effectiveDifficulty = Math.max(
      1,
      Math.min(10, Math.round((userDifficulty.rating - 100) / 200) + 1),
    );

    const valkey = getValkey();
    if (valkey) {
      const cached = await valkey
        .get(cacheKey(cacheSeed, effectiveDifficulty))
        .catch(() => null);
      if (cached) {
        const cachedPersona = JSON.parse(cached) as {
          id: string;
          persona_json: PersonaOutput;
        };
        return reply.send(cachedPersona);
      }
    }

    const difficultySection = eloRating
      ? buildDifficultyPromptSection(eloRating)
      : "";

    const prompt = buildPrompt(
      lead,
      scenario_type,
      effectiveDifficulty,
      difficultySection,
      prospect_profile,
    );

    let text: string;
    try {
      const result = await generateText({
        model: openai("gpt-4o"),
        system:
          "You are an expert sales training persona generator. Generate realistic buyer personas for role-play calls. Always respond with valid JSON matching the requested schema. Do NOT wrap the JSON in markdown code fences.",
        prompt,
        maxOutputTokens: 2048,
      });
      text = result.text;
    } catch (err) {
      request.log.error(err, "OpenAI generateText failed");
      return reply.status(500).send({
        code: "AI_ERROR",
        message: "Failed to generate persona — AI service error",
      });
    }

    let parsedPersona: PersonaOutput;
    try {
      // Strip markdown code fences if present
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      }
      const raw = JSON.parse(cleaned);
      parsedPersona = PersonaOutputSchema.parse(raw);
    } catch (parseErr) {
      request.log.error({ text, error: parseErr }, "Persona JSON parse/validation failed");
      return reply.status(500).send({
        code: "PERSONA_INVALID",
        message: "Failed to generate valid persona",
      });
    }

    const personaJson = normalizePersona(parsedPersona, lead);

    const { data: persona, error: insertError } = await supabase
      .from("personas")
      .insert({
        lead_id: lead.id,
        org_id: lead.org_id,
        persona_json: personaJson,
        difficulty_level: effectiveDifficulty,
      })
      .select("id, persona_json")
      .single();

    if (insertError || !persona) {
      return reply.status(500).send({
        code: "PERSONA_SAVE_FAILED",
        message: "Failed to save persona",
      });
    }

    if (valkey) {
      await valkey
        .set(
          cacheKey(cacheSeed, effectiveDifficulty),
          JSON.stringify(persona),
          "EX",
          CACHE_TTL,
        )
        .catch(() => { });
    }

    return reply.send(persona);
  }

  app.post<{ Body: z.infer<typeof requestSchema> }>(
    "/api/personas/generate",
    async (request, reply) => handleGeneratePersona(request, reply),
  );

  app.post<{ Body: z.infer<typeof requestSchema> }>(
    "/api/persona/generate",
    async (request, reply) => handleGeneratePersona(request, reply),
  );
}

function buildPrompt(
  lead: LeadRow,
  scenarioType: ScenarioType | undefined,
  difficulty: number,
  adaptiveDifficultySection?: string,
  profile?: z.infer<typeof ProspectProfileSchema>,
): string {
  const difficultyDesc =
    difficulty <= 3
      ? "relatively easy to convince — open-minded and receptive"
      : difficulty <= 6
        ? "moderately challenging — has concerns but is willing to listen"
        : "very tough — highly skeptical, pushes back hard on everything";

  const scenarioContext = {
    cold_call:
      "Cold call role-play. The seller needs to earn your attention quickly and book next steps.",
    discovery:
      "Discovery role-play. The seller is trying to uncover your business pain and qualification details.",
    objection_handling:
      "Objection handling role-play. Raise realistic concerns about cost, timing, risks, and alternatives.",
    closing:
      "Closing role-play. Discuss final decision criteria, legal/procurement concerns, and commitment risks.",
  }[scenarioType ?? "cold_call"];

  const optionalContext = profile?.primary_challenge
    ? `- Primary challenge: ${profile.primary_challenge}`
    : "";

  return `Generate a realistic buyer persona for sales call simulation at difficulty ${difficulty}/10 (${difficultyDesc}).

Scenario context:
${scenarioContext}

Prospect context:
- Name: ${lead.name}
- Company: ${lead.company}
- Title: ${lead.title || "Unknown"}
- Industry: ${lead.industry || "Unknown"}
${optionalContext}
${lead.data_json ? `- Additional context: ${JSON.stringify(lead.data_json)}` : ""}

Return JSON with:
- name: the buyer's first and last name
- role: buyer's role/title
- company: buyer's company
- tone: short style cue for voice tone
- personality_traits: array of 3-5 traits
- communication_style: how they communicate
- likely_objections: array of 3-5 realistic objections
- pain_points: array of 2-4 business pain points
- decision_criteria: key purchasing factors
- emotional_state: current disposition
- time_pressure_level: "low", "medium", or "high"
- background_summary: 2-3 sentence summary

Make it realistic and specific. Objections must match the scenario and role.
${adaptiveDifficultySection || ""}
Respond ONLY with JSON.`;
}

function normalizePersona(persona: PersonaOutput, lead: LeadRow) {
  const name = persona.name?.trim() || lead.name || "Alex Morgan";
  const role = persona.role?.trim() || lead.title || "Director";
  const company = persona.company?.trim() || lead.company || "Acme Inc";
  const tone = persona.tone?.trim() || persona.communication_style || "Professional";

  return {
    ...persona,
    name,
    role,
    company,
    tone,
    objections: persona.likely_objections.join("; "),
    pain_points_text: persona.pain_points.join("; "),
    background: persona.background_summary,
  };
}

function buildSyntheticLead(
  orgId: string,
  scenarioType: ScenarioType,
  profile?: z.infer<typeof ProspectProfileSchema>,
) {
  const defaults: Record<
    ScenarioType,
    { name: string; company: string; title: string; industry: string; challenge: string }
  > = {
    cold_call: {
      name: "Jordan Blake",
      company: "Northstar Systems",
      title: "VP of Operations",
      industry: "Technology",
      challenge: "Manual workflows slow response times and create internal bottlenecks.",
    },
    discovery: {
      name: "Maya Patel",
      company: "Summit Health Group",
      title: "Director of Revenue Operations",
      industry: "Healthcare",
      challenge: "Pipeline visibility is poor and forecast accuracy is unreliable.",
    },
    objection_handling: {
      name: "Ethan Rivera",
      company: "Atlas Manufacturing",
      title: "Procurement Manager",
      industry: "Manufacturing",
      challenge: "Budget pressure and incumbent vendor contracts make changes difficult.",
    },
    closing: {
      name: "Riley Chen",
      company: "BridgePoint Financial",
      title: "Head of Sales",
      industry: "Financial Services",
      challenge: "The team is aligned on value but needs low-risk rollout and clear ROI.",
    },
  };

  const base = defaults[scenarioType];

  return {
    org_id: orgId,
    name: profile?.name ?? base.name,
    company: profile?.company ?? base.company,
    title: profile?.title ?? base.title,
    industry: profile?.industry ?? base.industry,
    crm_source: "manual",
    data_json: {
      source: "simulation_profile",
      synthetic: true,
      scenario_type: scenarioType,
      primary_challenge: profile?.primary_challenge ?? base.challenge,
    },
  };
}
