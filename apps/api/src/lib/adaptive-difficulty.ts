import { createServiceClient } from "./supabase.js";

// ── ELO constants ────────────────────────────────────────────

const K_FACTOR = 32;
const WIN_THRESHOLD = 80;
const LOSS_THRESHOLD = 60;

// ── Difficulty parameters derived from ELO rating ───────────

interface DifficultyParams {
  objection_frequency: "low" | "medium" | "high";
  objection_complexity: "simple" | "moderate" | "complex";
  prospect_patience: "patient" | "moderate" | "impatient";
  decision_authority: "sole_decider" | "influencer" | "committee";
  emotional_variability: "stable" | "moderate" | "volatile";
  information_sharing: "open" | "guarded" | "minimal";
}

function getDifficultyLevel(rating: number): "easy" | "medium" | "hard" {
  if (rating < 900) return "easy";
  if (rating <= 1100) return "medium";
  return "hard";
}

export function getDifficultyParams(rating: number): DifficultyParams {
  const level = getDifficultyLevel(rating);

  switch (level) {
    case "easy":
      return {
        objection_frequency: "low",
        objection_complexity: "simple",
        prospect_patience: "patient",
        decision_authority: "sole_decider",
        emotional_variability: "stable",
        information_sharing: "open",
      };
    case "medium":
      return {
        objection_frequency: "medium",
        objection_complexity: "moderate",
        prospect_patience: "moderate",
        decision_authority: "influencer",
        emotional_variability: "moderate",
        information_sharing: "guarded",
      };
    case "hard":
      return {
        objection_frequency: "high",
        objection_complexity: "complex",
        prospect_patience: "impatient",
        decision_authority: "committee",
        emotional_variability: "volatile",
        information_sharing: "minimal",
      };
  }
}

export function buildDifficultyPromptSection(rating: number): string {
  const params = getDifficultyParams(rating);
  const level = getDifficultyLevel(rating);

  return `
ADAPTIVE DIFFICULTY (${level.toUpperCase()} — ELO ${rating}):
- Objection frequency: ${params.objection_frequency} — raise objections ${params.objection_frequency === "low" ? "rarely" : params.objection_frequency === "medium" ? "occasionally" : "frequently and aggressively"}
- Objection complexity: ${params.objection_complexity} — objections are ${params.objection_complexity === "simple" ? "straightforward and easy to address" : params.objection_complexity === "moderate" ? "nuanced and require thoughtful responses" : "multi-layered, combining technical, business, and emotional concerns"}
- Prospect patience: ${params.prospect_patience} — the prospect is ${params.prospect_patience === "patient" ? "willing to listen and give time" : params.prospect_patience === "moderate" ? "somewhat time-constrained" : "very busy and quickly frustrated by poor pitches"}
- Decision authority: ${params.decision_authority} — this person is a ${params.decision_authority.replace("_", " ")}
- Emotional variability: ${params.emotional_variability} — their mood is ${params.emotional_variability === "stable" ? "consistent and predictable" : params.emotional_variability === "moderate" ? "somewhat reactive" : "unpredictable and prone to shifts"}
- Information sharing: ${params.information_sharing} — they share information ${params.information_sharing === "open" ? "freely and openly" : params.information_sharing === "guarded" ? "cautiously, requiring trust-building" : "minimally, making discovery very challenging"}`;
}

// ── ELO update after session ────────────────────────────────

export async function updateEloRating(
  userId: string,
  sessionScore: number,
): Promise<{ oldRating: number; newRating: number; change: number }> {
  const supabase = createServiceClient();

  // Get current rating
  const { data: user } = await supabase
    .from("users")
    .select("elo_rating")
    .eq("id", userId)
    .single();

  const oldRating = user?.elo_rating ?? 1000;

  // Calculate expected score (0-1 scale, where 1 = definitely win)
  const expectedScore = 1 / (1 + Math.pow(10, (1000 - oldRating) / 400));

  // Determine actual score
  let actualScore: number;
  if (sessionScore >= WIN_THRESHOLD) {
    actualScore = 1; // Win
  } else if (sessionScore < LOSS_THRESHOLD) {
    actualScore = 0; // Loss
  } else {
    actualScore = 0.5; // Draw
  }

  // Calculate rating change
  const change = Math.round(K_FACTOR * (actualScore - expectedScore));
  const newRating = Math.max(100, oldRating + change);

  // Update in database
  await supabase
    .from("users")
    .update({ elo_rating: newRating })
    .eq("id", userId);

  // Log rating history
  await supabase.from("elo_history").insert({
    user_id: userId,
    old_rating: oldRating,
    new_rating: newRating,
    session_score: sessionScore,
    change,
  });

  return { oldRating, newRating, change };
}

// ── Get user's current difficulty level for display ─────────

export async function getUserDifficulty(userId: string) {
  const supabase = createServiceClient();

  const { data: user } = await supabase
    .from("users")
    .select("elo_rating")
    .eq("id", userId)
    .single();

  const rating = user?.elo_rating ?? 1000;
  const level = getDifficultyLevel(rating);
  const params = getDifficultyParams(rating);

  return { rating, level, params };
}
