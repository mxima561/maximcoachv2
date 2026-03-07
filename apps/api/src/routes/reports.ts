import type { FastifyInstance } from "fastify";
import { createServiceClient } from "../lib/supabase.js";
import { requireAuth, requireOrgMembership } from "../lib/auth.js";

export async function reportRoutes(app: FastifyInstance) {
  const supabase = createServiceClient();

  // GET /api/reports/team-heatmap — skill scores by rep
  app.get<{
    Querystring: { org_id: string; days?: string };
  }>("/api/reports/team-heatmap", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { org_id, days } = request.query;
    if (!org_id) return reply.status(400).send({ error: "org_id required" });

    const membership = await requireOrgMembership(reply, org_id, auth.userId, ["admin", "manager"]);
    if (!membership) return;

    const daysBack = Number(days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    // Get all reps in org
    const { data: orgUsers } = await supabase
      .from("users")
      .select("id, name")
      .eq("org_id", org_id)
      .eq("role", "rep");

    if (!orgUsers) return reply.send({ heatmap: [] });

    // Get scorecards for each rep
    const heatmap = [];
    for (const user of orgUsers) {
      const { data: scorecards } = await supabase
        .from("scorecards")
        .select("scores")
        .eq("user_id", user.id)
        .gte("created_at", since.toISOString());

      // Aggregate skill scores
      const skillTotals: Record<string, { sum: number; count: number }> = {};
      for (const sc of scorecards ?? []) {
        const scores = sc.scores as Record<string, number> | null;
        if (!scores) continue;
        for (const [skill, score] of Object.entries(scores)) {
          if (typeof score !== "number") continue;
          if (!skillTotals[skill]) skillTotals[skill] = { sum: 0, count: 0 };
          skillTotals[skill].sum += score;
          skillTotals[skill].count++;
        }
      }

      const skills: Record<string, number> = {};
      for (const [skill, { sum, count }] of Object.entries(skillTotals)) {
        skills[skill] = Math.round(sum / count);
      }

      heatmap.push({
        user_id: user.id,
        name: user.name,
        session_count: scorecards?.length ?? 0,
        skills,
      });
    }

    return reply.send({ heatmap });
  });

  // GET /api/reports/at-risk — reps who are falling behind
  app.get<{
    Querystring: { org_id: string };
  }>("/api/reports/at-risk", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { org_id } = request.query;
    if (!org_id) return reply.status(400).send({ error: "org_id required" });

    const membership = await requireOrgMembership(reply, org_id, auth.userId, ["admin", "manager"]);
    if (!membership) return;

    // Get reps with gamification data
    const { data: reps } = await supabase
      .from("users")
      .select("id, name, total_xp, current_streak, last_practice_date")
      .eq("org_id", org_id)
      .eq("role", "rep");

    if (!reps) return reply.send({ at_risk: [] });

    const atRisk = [];
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    for (const rep of reps) {
      const risks: string[] = [];

      // Check inactivity
      if (!rep.last_practice_date) {
        risks.push("Never practiced");
      } else if (new Date(rep.last_practice_date) < oneWeekAgo) {
        const daysSince = Math.floor(
          (Date.now() - new Date(rep.last_practice_date).getTime()) / (1000 * 60 * 60 * 24),
        );
        risks.push(`Inactive for ${daysSince} days`);
      }

      // Check streak broken
      if (rep.current_streak === 0 && rep.last_practice_date) {
        risks.push("Streak broken");
      }

      // Check low scores (recent sessions)
      const { data: recentScores } = await supabase
        .from("scorecards")
        .select("overall_score")
        .eq("user_id", rep.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (recentScores && recentScores.length >= 3) {
        const avg =
          recentScores.reduce((sum, s) => sum + s.overall_score, 0) / recentScores.length;
        if (avg < 60) risks.push(`Low avg score (${Math.round(avg)})`);
      }

      if (risks.length > 0) {
        atRisk.push({
          user_id: rep.id,
          name: rep.name,
          risks,
          last_practice: rep.last_practice_date,
          current_streak: rep.current_streak,
        });
      }
    }

    return reply.send({ at_risk: atRisk });
  });

  // GET /api/reports/coaching-agenda — auto-generated agenda for 1:1
  app.get<{
    Querystring: { org_id: string; rep_id: string };
  }>("/api/reports/coaching-agenda", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { org_id, rep_id } = request.query;
    if (!org_id || !rep_id) {
      return reply.status(400).send({ error: "org_id and rep_id required" });
    }

    const membership = await requireOrgMembership(reply, org_id, auth.userId, ["admin", "manager"]);
    if (!membership) return;

    // Get rep info
    const { data: rep } = await supabase
      .from("users")
      .select("name, total_xp, current_streak, rank_level")
      .eq("id", rep_id)
      .single();

    if (!rep) return reply.status(404).send({ error: "Rep not found" });

    // Get recent sessions with scores
    const { data: sessions } = await supabase
      .from("scorecards")
      .select("scores, overall_score, coaching_text, created_at")
      .eq("user_id", rep_id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Build agenda items
    const agenda: Array<{ category: string; item: string; priority: "high" | "medium" | "low" }> = [];

    // Celebrate wins
    if (rep.current_streak >= 7) {
      agenda.push({
        category: "Celebration",
        item: `${rep.name} has a ${rep.current_streak}-day streak! Acknowledge their consistency.`,
        priority: "medium",
      });
    }

    // Identify weakest skills
    const skillTotals: Record<string, { sum: number; count: number }> = {};
    for (const sc of sessions ?? []) {
      const scores = sc.scores as Record<string, number> | null;
      if (!scores) continue;
      for (const [skill, score] of Object.entries(scores)) {
        if (typeof score !== "number") continue;
        if (!skillTotals[skill]) skillTotals[skill] = { sum: 0, count: 0 };
        skillTotals[skill].sum += score;
        skillTotals[skill].count++;
      }
    }

    const skillAvgs = Object.entries(skillTotals)
      .map(([skill, { sum, count }]) => ({ skill, avg: Math.round(sum / count) }))
      .sort((a, b) => a.avg - b.avg);

    // Weakest skills → high priority
    for (const weak of skillAvgs.slice(0, 2)) {
      if (weak.avg < 70) {
        agenda.push({
          category: "Skill Development",
          item: `Focus on ${weak.skill} (avg: ${weak.avg}). Assign targeted drills and role-play scenarios.`,
          priority: "high",
        });
      }
    }

    // Score trend
    const recentScores = (sessions ?? []).map((s) => s.overall_score).filter(Boolean);
    if (recentScores.length >= 4) {
      const recent = recentScores.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const older = recentScores.slice(3).reduce((a, b) => a + b, 0) / Math.max(recentScores.length - 3, 1);
      if (recent < older - 5) {
        agenda.push({
          category: "Performance",
          item: `Scores trending down (${Math.round(recent)} avg vs ${Math.round(older)} previously). Discuss blockers.`,
          priority: "high",
        });
      } else if (recent > older + 5) {
        agenda.push({
          category: "Performance",
          item: `Scores trending up (${Math.round(recent)} avg vs ${Math.round(older)} previously). Reinforce what's working.`,
          priority: "low",
        });
      }
    }

    // Latest coaching insights
    const latestCoaching = (sessions ?? [])
      .filter((s) => s.coaching_text)
      .slice(0, 1);
    if (latestCoaching.length > 0) {
      agenda.push({
        category: "AI Coaching",
        item: `Latest AI feedback: "${(latestCoaching[0].coaching_text as string).slice(0, 200)}..."`,
        priority: "medium",
      });
    }

    return reply.send({
      rep_name: rep.name,
      rep_xp: rep.total_xp,
      rep_streak: rep.current_streak,
      session_count: sessions?.length ?? 0,
      agenda: agenda.sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.priority] - order[b.priority];
      }),
    });
  });
}
