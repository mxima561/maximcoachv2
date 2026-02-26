import { describe, it, expect } from "vitest";
import {
  OrganizationSchema,
  UserSchema,
  SessionSchema,
  CoachingInsightSchema,
  SentimentEntrySchema,
} from "../schemas";
import { canAccess } from "../constants";

describe("OrganizationSchema", () => {
  it("validates a valid organization", () => {
    const valid = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Acme Corp",
      plan: "growth" as const,
      stripe_customer_id: "cus_123",
      created_at: "2026-01-01T00:00:00Z",
    };
    const result = OrganizationSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects an organization with empty name", () => {
    const invalid = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "",
      plan: "growth",
      stripe_customer_id: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    const result = OrganizationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects an organization with invalid plan", () => {
    const invalid = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Acme Corp",
      plan: "invalid_plan",
      stripe_customer_id: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    const result = OrganizationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("accepts nullable stripe_customer_id", () => {
    const valid = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Acme Corp",
      plan: "trial" as const,
      stripe_customer_id: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    const result = OrganizationSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts solo as a valid plan", () => {
    const valid = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Solo Rep",
      plan: "solo" as const,
      stripe_customer_id: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    const result = OrganizationSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe("UserSchema", () => {
  it("validates a valid user", () => {
    const valid = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      org_id: "660e8400-e29b-41d4-a716-446655440000",
      role: "rep" as const,
      name: "Jane Doe",
      email: "jane@acme.com",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const result = UserSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects a user with invalid email", () => {
    const invalid = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      org_id: "660e8400-e29b-41d4-a716-446655440000",
      role: "rep",
      name: "Jane Doe",
      email: "not-an-email",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const result = UserSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects a user with invalid role", () => {
    const invalid = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      org_id: "660e8400-e29b-41d4-a716-446655440000",
      role: "superadmin",
      name: "Jane Doe",
      email: "jane@acme.com",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const result = UserSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("SessionSchema", () => {
  const baseSession = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    user_id: "660e8400-e29b-41d4-a716-446655440000",
    org_id: "770e8400-e29b-41d4-a716-446655440000",
    persona_id: "880e8400-e29b-41d4-a716-446655440000",
    scenario_type: "cold_call" as const,
    session_type: "simulation" as const,
    status: "active" as const,
    started_at: "2026-01-01T00:00:00Z",
    ended_at: null,
    tokens_used: null,
    audio_seconds_stt: null,
    audio_seconds_tts: null,
    cost_usd: null,
  };

  it("validates a simulation session", () => {
    const result = SessionSchema.safeParse(baseSession);
    expect(result.success).toBe(true);
  });

  it("validates a live_coaching session", () => {
    const result = SessionSchema.safeParse({
      ...baseSession,
      session_type: "live_coaching",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid session_type", () => {
    const result = SessionSchema.safeParse({
      ...baseSession,
      session_type: "webinar",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a session with invalid scenario_type", () => {
    const result = SessionSchema.safeParse({
      ...baseSession,
      scenario_type: "invalid_type",
    });
    expect(result.success).toBe(false);
  });
});

describe("SentimentEntrySchema", () => {
  it("validates a valid sentiment entry", () => {
    const result = SentimentEntrySchema.safeParse({
      timestamp: "2026-01-01T00:01:30Z",
      score: 0.85,
      label: "positive",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid label", () => {
    const result = SentimentEntrySchema.safeParse({
      timestamp: "2026-01-01T00:01:30Z",
      score: 0.5,
      label: "angry",
    });
    expect(result.success).toBe(false);
  });
});

describe("CoachingInsightSchema", () => {
  it("validates a complete coaching insight", () => {
    const result = CoachingInsightSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      session_id: "660e8400-e29b-41d4-a716-446655440000",
      org_id: "770e8400-e29b-41d4-a716-446655440000",
      sentiment_timeline: [
        { timestamp: "2026-01-01T00:01:00Z", score: 0.7, label: "positive" },
        { timestamp: "2026-01-01T00:02:00Z", score: 0.3, label: "negative" },
      ],
      talk_ratio: 0.45,
      topics_covered: ["pricing", "features"],
      topics_missed: ["competition"],
      suggestions_surfaced: 3,
      battle_cards_triggered: 1,
      overall_sentiment: "positive",
      created_at: "2026-01-01T00:05:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects talk_ratio out of range", () => {
    const result = CoachingInsightSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      session_id: "660e8400-e29b-41d4-a716-446655440000",
      org_id: "770e8400-e29b-41d4-a716-446655440000",
      talk_ratio: 1.5,
      created_at: "2026-01-01T00:05:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("canAccess", () => {
  it("solo plan can access live_coaching", () => {
    expect(canAccess("solo", "live_coaching")).toBe(true);
  });

  it("solo plan cannot access leaderboards", () => {
    expect(canAccess("solo", "leaderboards")).toBe(false);
  });

  it("solo plan cannot access simulation", () => {
    expect(canAccess("solo", "simulation")).toBe(false);
  });

  it("growth plan can access leaderboards", () => {
    expect(canAccess("growth", "leaderboards")).toBe(true);
  });

  it("starter plan cannot access crm_sync", () => {
    expect(canAccess("starter", "crm_sync")).toBe(false);
  });

  it("scale plan can access crm_sync", () => {
    expect(canAccess("scale", "crm_sync")).toBe(true);
  });

  it("free plan cannot access any gated features", () => {
    expect(canAccess("free", "live_coaching")).toBe(false);
    expect(canAccess("free", "simulation")).toBe(false);
    expect(canAccess("free", "leaderboards")).toBe(false);
  });

  it("enterprise plan can access everything", () => {
    expect(canAccess("enterprise", "live_coaching")).toBe(true);
    expect(canAccess("enterprise", "simulation")).toBe(true);
    expect(canAccess("enterprise", "leaderboards")).toBe(true);
    expect(canAccess("enterprise", "crm_sync")).toBe(true);
    expect(canAccess("enterprise", "h2h")).toBe(true);
  });
});
