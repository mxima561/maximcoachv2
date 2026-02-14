import { z } from "zod";
import {
  ROLES,
  SCENARIO_TYPES,
  SESSION_STATUSES,
  CRM_SOURCES,
  PLANS,
} from "./constants.js";

// ── Organization ──────────────────────────────────────────────

export const OrganizationSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1),
  plan: z.enum(PLANS),
  stripe_customer_id: z.string().nullable(),
  created_at: z.string().datetime(),
});

export type Organization = z.infer<typeof OrganizationSchema>;

// ── User ──────────────────────────────────────────────────────

export const UserSchema = z.strictObject({
  id: z.uuid(),
  org_id: z.uuid(),
  role: z.enum(ROLES),
  name: z.string().min(1),
  email: z.string().email(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

// ── Lead ──────────────────────────────────────────────────────

export const LeadSchema = z.strictObject({
  id: z.uuid(),
  org_id: z.uuid(),
  name: z.string().min(1),
  company: z.string().min(1),
  title: z.string().nullable(),
  industry: z.string().nullable(),
  crm_source: z.enum(CRM_SOURCES),
  data_json: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Lead = z.infer<typeof LeadSchema>;

// ── Persona ───────────────────────────────────────────────────

export const PersonaSchema = z.strictObject({
  id: z.uuid(),
  lead_id: z.uuid(),
  org_id: z.uuid(),
  persona_json: z.record(z.string(), z.unknown()),
  difficulty_level: z.number().int().min(1).max(10),
  created_at: z.string().datetime(),
});

export type Persona = z.infer<typeof PersonaSchema>;

// ── Session ───────────────────────────────────────────────────

export const SessionSchema = z.strictObject({
  id: z.uuid(),
  user_id: z.uuid(),
  org_id: z.uuid(),
  persona_id: z.uuid().nullable(),
  scenario_type: z.enum(SCENARIO_TYPES),
  status: z.enum(SESSION_STATUSES),
  started_at: z.string().datetime(),
  ended_at: z.string().datetime().nullable(),
  tokens_used: z.number().int().nullable(),
  audio_seconds_stt: z.number().nullable(),
  audio_seconds_tts: z.number().nullable(),
  cost_usd: z.number().nullable(),
});

export type Session = z.infer<typeof SessionSchema>;

// ── Transcript ────────────────────────────────────────────────

export const TranscriptMessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.string().datetime(),
});

export const TranscriptSchema = z.strictObject({
  id: z.uuid(),
  session_id: z.uuid(),
  messages: z.array(TranscriptMessageSchema),
  word_timestamps: z.array(z.record(z.string(), z.unknown())).nullable(),
  created_at: z.string().datetime(),
});

export type TranscriptMessage = z.infer<typeof TranscriptMessageSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;

// ── Scorecard ─────────────────────────────────────────────────

export const ScorecardCategorySchema = z.strictObject({
  score: z.number().int().min(0).max(100),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  coaching_tip: z.string(),
});

export const ScorecardScoresSchema = z.strictObject({
  opening: ScorecardCategorySchema,
  discovery: ScorecardCategorySchema,
  objection_handling: ScorecardCategorySchema,
  closing: ScorecardCategorySchema,
  communication: ScorecardCategorySchema,
});

export const ScorecardSchema = z.strictObject({
  id: z.uuid(),
  session_id: z.uuid(),
  user_id: z.uuid(),
  org_id: z.uuid(),
  scores: ScorecardScoresSchema,
  overall_score: z.number().int().min(0).max(100),
  coaching_text: z.string(),
  created_at: z.string().datetime(),
});

export type ScorecardCategory = z.infer<typeof ScorecardCategorySchema>;
export type ScorecardScores = z.infer<typeof ScorecardScoresSchema>;
export type Scorecard = z.infer<typeof ScorecardSchema>;

// ── Scenario ──────────────────────────────────────────────────

export const ScenarioSchema = z.strictObject({
  id: z.uuid(),
  org_id: z.uuid(),
  name: z.string().min(1),
  type: z.enum(SCENARIO_TYPES),
  industry: z.string().nullable(),
  config_json: z.record(z.string(), z.unknown()).nullable(),
  is_custom: z.boolean(),
  created_at: z.string().datetime(),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

// ── Integration ───────────────────────────────────────────────

export const IntegrationSchema = z.strictObject({
  id: z.uuid(),
  org_id: z.uuid(),
  provider: z.enum(["salesforce", "hubspot", "google_sheets"]),
  access_token_encrypted: z.string(),
  refresh_token_encrypted: z.string().nullable(),
  last_sync: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});

export type Integration = z.infer<typeof IntegrationSchema>;
