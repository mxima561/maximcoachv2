import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createServiceClient } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";
import { sendValidationError } from "../lib/http-errors.js";

// ── XP reward amounts ────────────────────────────────────────

const XP_REWARDS: Record<string, number> = {
  session_complete: 100,
  drill_complete: 50,
  streak_bonus: 25,       // per streak day (3→75, 7→175, etc.)
  h2h_win: 150,
  challenge_complete: 200,
  first_session_of_day: 25,
  perfect_score: 500,
};

// ── Rank definitions (mirrored from DB for fast lookups) ─────

const RANKS = [
  { level: 1,  name: "Rookie",       minXp: 0 },
  { level: 2,  name: "Prospect",     minXp: 500 },
  { level: 3,  name: "Closer",       minXp: 2000 },
  { level: 4,  name: "Dealmaker",    minXp: 5000 },
  { level: 5,  name: "Rainmaker",    minXp: 10000 },
  { level: 6,  name: "Sales Ace",    minXp: 20000 },
  { level: 7,  name: "Revenue King", minXp: 40000 },
  { level: 8,  name: "Legend",       minXp: 75000 },
  { level: 9,  name: "Grandmaster",  minXp: 120000 },
  { level: 10, name: "Titan",        minXp: 200000 },
];

function getRankProgress(totalXp: number) {
  const current = RANKS.filter((r) => r.minXp <= totalXp).pop()!;
  const next = RANKS.find((r) => r.minXp > totalXp);
  return {
    current,
    next: next ?? null,
    progressToNext: next
      ? Math.round(((totalXp - current.minXp) / (next.minXp - current.minXp)) * 100)
      : 100,
  };
}

// ── Schemas ──────────────────────────────────────────────────

const AwardXpSchema = z.object({
  event_type: z.enum([
    "session_complete", "drill_complete", "badge_earned",
    "streak_bonus", "h2h_win", "challenge_complete",
    "first_session_of_day", "perfect_score",
  ]),
  source_id: z.string().uuid().optional(),
  source_type: z.string().optional(),
  xp_override: z.number().int().positive().optional(),
});

// ── Badge evaluation (shared between route and worker) ──────

export async function evaluateBadgesForUser(userId: string) {
  const supabase = createServiceClient();

  const { data: user } = await supabase
    .from("users")
    .select("total_xp, current_streak, longest_streak, org_id")
    .eq("id", userId)
    .single();

  if (!user?.org_id) return { new_badges: [] };

  const [{ data: earned }, { data: allBadges }, { count: sessionCount }, { data: bestScoreData }, { data: scenarios }, { count: h2hWins }, { count: challengesDone }] = await Promise.all([
    supabase.from("user_badges").select("badge_id").eq("user_id", userId),
    supabase.from("badges").select("*"),
    supabase.from("sessions").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("scorecards").select("overall_score").eq("user_id", userId).order("overall_score", { ascending: false }).limit(1),
    supabase.from("sessions").select("scenario_type").eq("user_id", userId),
    supabase.from("h2h_matches").select("*", { count: "exact", head: true }).eq("status", "scored").or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`),
    supabase.from("challenge_entries").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("completed", true),
  ]);

  const earnedIds = new Set(earned?.map((e) => e.badge_id) ?? []);
  if (!allBadges) return { new_badges: [] };

  const statsMap: Record<string, number> = {
    total_sessions: sessionCount ?? 0,
    streak_days: Math.max(user.current_streak, user.longest_streak),
    best_score: bestScoreData?.[0]?.overall_score ?? 0,
    unique_scenarios: new Set(scenarios?.map((s) => s.scenario_type) ?? []).size,
    h2h_wins: h2hWins ?? 0,
    challenges_done: challengesDone ?? 0,
  };

  const newBadges: Array<{ id: string; slug: string; name: string; xp_reward: number }> = [];

  for (const badge of allBadges) {
    if (earnedIds.has(badge.id)) continue;
    if (badge.criteria_type === "special") continue;

    const stat = statsMap[badge.criteria_type];
    if (stat !== undefined && stat >= badge.criteria_value) {
      await supabase.from("user_badges").insert({
        user_id: userId,
        badge_id: badge.id,
      });

      await supabase.from("xp_events").insert({
        user_id: userId,
        org_id: user.org_id,
        event_type: "badge_earned",
        xp_amount: badge.xp_reward,
        source_id: badge.id,
        source_type: "badge",
      });

      newBadges.push({
        id: badge.id,
        slug: badge.slug,
        name: badge.name,
        xp_reward: badge.xp_reward,
      });
    }
  }

  if (newBadges.length > 0) {
    const totalBadgeXp = newBadges.reduce((sum, b) => sum + b.xp_reward, 0);
    await supabase.rpc("increment_user_xp", {
      p_user_id: userId,
      p_amount: totalBadgeXp,
    });
  }

  return { new_badges: newBadges };
}

// ── Routes ───────────────────────────────────────────────────

export async function gamificationRoutes(app: FastifyInstance) {
  const supabase = createServiceClient();

  // GET /api/gamification/profile — user's XP, streak, rank, recent XP
  app.get("/api/gamification/profile", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { data: user, error } = await supabase
      .from("users")
      .select("total_xp, current_streak, longest_streak, last_practice_date, rank_level, daily_goal_minutes, timezone, org_id")
      .eq("id", auth.userId)
      .single();

    if (error || !user) return reply.status(404).send({ error: "User not found" });

    // Parallelize independent queries
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [{ data: todayXp }, { data: recentXp }] = await Promise.all([
      supabase
        .from("xp_events")
        .select("xp_amount")
        .eq("user_id", auth.userId)
        .gte("created_at", todayStart.toISOString()),
      supabase
        .from("xp_events")
        .select("*")
        .eq("user_id", auth.userId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const todayTotal = todayXp?.reduce((sum, e) => sum + e.xp_amount, 0) ?? 0;
    const rankProgress = getRankProgress(user.total_xp);
    const rank = RANKS.find((r) => r.level === user.rank_level) ?? RANKS[0];

    return reply.send({
      total_xp: user.total_xp,
      today_xp: todayTotal,
      current_streak: user.current_streak,
      longest_streak: user.longest_streak,
      last_practice_date: user.last_practice_date,
      daily_goal_minutes: user.daily_goal_minutes,
      rank: { ...rank, icon: "🔰" },
      rank_progress: rankProgress,
      recent_xp: recentXp ?? [],
    });
  });

  // POST /api/gamification/xp — award XP for an event
  app.post<{ Body: z.infer<typeof AwardXpSchema> }>(
    "/api/gamification/xp",
    async (request, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      const parsed = AwardXpSchema.safeParse(request.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);

      const { event_type, source_id, source_type, xp_override } = parsed.data;
      const xpAmount = xp_override ?? XP_REWARDS[event_type] ?? 50;

      // Get user's org_id
      const { data: user } = await supabase
        .from("users")
        .select("org_id, total_xp, current_streak, longest_streak, last_practice_date, timezone")
        .eq("id", auth.userId)
        .single();

      if (!user?.org_id) return reply.status(400).send({ error: "User has no org" });

      // Insert XP event
      const { error: xpError } = await supabase
        .from("xp_events")
        .insert({
          user_id: auth.userId,
          org_id: user.org_id,
          event_type,
          xp_amount: xpAmount,
          source_id: source_id ?? null,
          source_type: source_type ?? null,
        });

      if (xpError) return reply.status(500).send({ error: xpError.message });

      // Atomically increment XP to prevent race conditions
      const { data: xpResult } = await supabase.rpc("increment_user_xp", {
        p_user_id: auth.userId,
        p_amount: xpAmount,
      });
      const newTotalXp = xpResult ?? (user.total_xp + xpAmount);

      // Update streak if this is a session/drill completion
      let newStreak = user.current_streak;
      let longestStreak = user.longest_streak ?? 0;
      const today = new Date().toISOString().split("T")[0];
      const lastPractice = user.last_practice_date;

      if (["session_complete", "drill_complete"].includes(event_type)) {
        if (lastPractice !== today) {
          // Check if yesterday
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split("T")[0];

          if (lastPractice === yesterdayStr) {
            newStreak = user.current_streak + 1;
          } else if (!lastPractice) {
            newStreak = 1;
          } else {
            // Streak broken — check for comeback badge
            const lastDate = new Date(lastPractice);
            const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
            newStreak = 1;
            if (daysSince >= 7) {
              // Award comeback badge (handled by badge evaluation)
            }
          }
          longestStreak = Math.max(longestStreak, newStreak);
        }
      }

      const { error: updateError } = await supabase
        .from("users")
        .update({
          current_streak: newStreak,
          longest_streak: longestStreak,
          last_practice_date: today,
        })
        .eq("id", auth.userId);

      if (updateError) return reply.status(500).send({ error: updateError.message });

      // Check for rank up
      const oldRank = RANKS.filter((r) => r.minXp <= user.total_xp).pop()!;
      const newRank = RANKS.filter((r) => r.minXp <= newTotalXp).pop()!;
      const rankedUp = newRank.level > oldRank.level;

      return reply.send({
        xp_earned: xpAmount,
        total_xp: newTotalXp,
        streak: newStreak,
        longest_streak: longestStreak,
        ranked_up: rankedUp,
        new_rank: rankedUp ? newRank : null,
      });
    },
  );

  // GET /api/gamification/badges — all badges with earned status
  app.get("/api/gamification/badges", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const [{ data: allBadges }, { data: earned }] = await Promise.all([
      supabase.from("badges").select("*").order("category").order("criteria_value"),
      supabase.from("user_badges").select("badge_id, earned_at").eq("user_id", auth.userId),
    ]);

    const earnedMap = new Map(earned?.map((e) => [e.badge_id, e.earned_at]) ?? []);

    const badges = (allBadges ?? []).map((badge) => ({
      ...badge,
      earned: earnedMap.has(badge.id),
      earned_at: earnedMap.get(badge.id) ?? null,
    }));

    return reply.send({
      badges,
      earned_count: earnedMap.size,
      total_count: allBadges?.length ?? 0,
    });
  });

  // GET /api/gamification/ranks — rank definitions + user progress
  app.get("/api/gamification/ranks", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { data: user } = await supabase
      .from("users")
      .select("total_xp, rank_level")
      .eq("id", auth.userId)
      .single();

    const { data: ranks } = await supabase
      .from("ranks")
      .select("*")
      .order("level");

    return reply.send({
      ranks: ranks ?? [],
      user_xp: user?.total_xp ?? 0,
      user_rank_level: user?.rank_level ?? 1,
      progress: getRankProgress(user?.total_xp ?? 0),
    });
  });

  // POST /api/gamification/evaluate-badges — check and award any new badges
  app.post("/api/gamification/evaluate-badges", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const result = await evaluateBadgesForUser(auth.userId);
    return reply.send(result);
  });

  // PATCH /api/gamification/settings — update daily goal and timezone
  app.patch<{
    Body: { daily_goal_minutes?: number; timezone?: string };
  }>("/api/gamification/settings", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const updates: Record<string, unknown> = {};
    if (request.body.daily_goal_minutes !== undefined) {
      updates.daily_goal_minutes = request.body.daily_goal_minutes;
    }
    if (request.body.timezone !== undefined) {
      updates.timezone = request.body.timezone;
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: "No valid fields to update" });
    }

    const { error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", auth.userId);

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ updated: true });
  });
}
