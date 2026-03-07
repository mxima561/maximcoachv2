import type { FastifyInstance } from "fastify";
import { createServiceClient } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";

export async function drillRoutes(app: FastifyInstance) {
  const supabase = createServiceClient();

  // GET /api/drills — list drills (system + org)
  app.get<{
    Querystring: {
      skill_category?: string;
      difficulty_min?: string;
      difficulty_max?: string;
      scenario_type?: string;
    };
  }>("/api/drills", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { skill_category, difficulty_min, difficulty_max, scenario_type } = request.query;

    // Get user's org
    const { data: user } = await supabase
      .from("users")
      .select("org_id")
      .eq("id", auth.userId)
      .single();

    let query = supabase
      .from("drills")
      .select("*, skill_categories(name, slug, icon)")
      .or(`is_system.eq.true,org_id.eq.${user?.org_id}`)
      .order("difficulty")
      .order("title");

    if (skill_category) {
      const { data: cat } = await supabase
        .from("skill_categories")
        .select("id")
        .eq("slug", skill_category)
        .single();
      if (cat) query = query.eq("skill_category_id", cat.id);
    }
    if (difficulty_min) query = query.gte("difficulty", Number(difficulty_min));
    if (difficulty_max) query = query.lte("difficulty", Number(difficulty_max));
    if (scenario_type) query = query.eq("scenario_type", scenario_type);

    const { data, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send(data);
  });

  // GET /api/drills/:id — single drill
  app.get<{ Params: { id: string } }>("/api/drills/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { data, error } = await supabase
      .from("drills")
      .select("*, skill_categories(name, slug, icon)")
      .eq("id", request.params.id)
      .single();

    if (error || !data) return reply.status(404).send({ error: "Drill not found" });
    return reply.send(data);
  });

  // GET /api/skill-categories — list all skill categories
  app.get("/api/skill-categories", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { data, error } = await supabase
      .from("skill_categories")
      .select("*")
      .order("sort_order");

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send(data);
  });

  // GET /api/daily-plans/today — get or generate today's plan
  app.get("/api/daily-plans/today", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const today = new Date().toISOString().split("T")[0];

    // Check if plan exists
    const { data: existing } = await supabase
      .from("daily_training_plans")
      .select("*")
      .eq("user_id", auth.userId)
      .eq("plan_date", today)
      .single();

    if (existing) return reply.send(existing);

    // Auto-generate plan
    const plan = await generateDailyPlan(supabase, auth.userId, today);
    if (!plan) return reply.status(500).send({ error: "Failed to generate daily plan" });
    return reply.send(plan);
  });

  // POST /api/daily-plans/generate — force regenerate
  app.post("/api/daily-plans/generate", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const today = new Date().toISOString().split("T")[0];

    // Delete existing plan for today
    await supabase
      .from("daily_training_plans")
      .delete()
      .eq("user_id", auth.userId)
      .eq("plan_date", today);

    const plan = await generateDailyPlan(supabase, auth.userId, today);
    if (!plan) return reply.status(500).send({ error: "Failed to generate daily plan" });
    return reply.send(plan);
  });

  // PATCH /api/daily-plans/:id/drills/:drillIndex/complete — mark drill complete
  app.patch<{
    Params: { id: string; drillIndex: string };
  }>("/api/daily-plans/:id/drills/:drillIndex/complete", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { id, drillIndex } = request.params;
    const idx = Number(drillIndex);

    const { data: plan } = await supabase
      .from("daily_training_plans")
      .select("*")
      .eq("id", id)
      .eq("user_id", auth.userId)
      .single();

    if (!plan) return reply.status(404).send({ error: "Plan not found" });

    const drills = plan.drills as Array<{
      drill_id: string;
      title: string;
      skill_category: string;
      difficulty: number;
      status: string;
      completed_at: string | null;
      xp_earned: number;
    }>;

    if (idx < 0 || idx >= drills.length) {
      return reply.status(400).send({ error: "Invalid drill index" });
    }

    if (drills[idx].status === "completed") {
      return reply.status(409).send({ error: "Drill already completed" });
    }

    // Mark drill complete
    drills[idx].status = "completed";
    drills[idx].completed_at = new Date().toISOString();
    drills[idx].xp_earned = 50; // drill_complete XP

    // Check if all drills are done
    const allDone = drills.every((d) => d.status === "completed");
    const planStatus = allDone ? "completed" : "in_progress";

    const { error } = await supabase
      .from("daily_training_plans")
      .update({ drills, status: planStatus })
      .eq("id", id);

    if (error) return reply.status(500).send({ error: error.message });

    return reply.send({
      drill_completed: drills[idx],
      plan_status: planStatus,
      all_done: allDone,
      xp_earned: 50,
    });
  });
}

// ── Plan generation logic ────────────────────────────────────

async function generateDailyPlan(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  planDate: string,
) {
  // Get user's org
  const { data: user } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", userId)
    .single();

  if (!user?.org_id) return null;

  // Get recent scorecards to analyze weaknesses
  const { data: recentScores } = await supabase
    .from("scorecards")
    .select("scores, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  // Analyze skill performance from scorecard data
  const skillScores = new Map<string, number[]>();

  if (recentScores) {
    for (const sc of recentScores) {
      const scores = sc.scores as Record<string, number> | null;
      if (!scores) continue;
      for (const [skill, score] of Object.entries(scores)) {
        if (typeof score !== "number") continue;
        const arr = skillScores.get(skill) ?? [];
        arr.push(score);
        skillScores.set(skill, arr);
      }
    }
  }

  // Calculate averages and sort by weakest
  const skillAvgs: Array<{ skill: string; avg: number }> = [];
  for (const [skill, scores] of skillScores) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    skillAvgs.push({ skill, avg });
  }
  skillAvgs.sort((a, b) => a.avg - b.avg);

  // Get all system drills with categories
  const { data: allDrills } = await supabase
    .from("drills")
    .select("*, skill_categories(name, slug, icon)")
    .or(`is_system.eq.true,org_id.eq.${user.org_id}`)
    .order("difficulty");

  if (!allDrills || allDrills.length === 0) return null;

  // Pick 3 drills: 2 weakest + 1 strength
  const selectedDrills: typeof allDrills = [];

  // Get skill category IDs for matching
  const { data: categories } = await supabase
    .from("skill_categories")
    .select("id, slug, name");

  const catMap = new Map(categories?.map((c) => [c.slug, c]) ?? []);

  // Try to match weak skills to drill categories
  const weakSkills = skillAvgs.slice(0, 2);
  const strongSkills = skillAvgs.slice(-1);

  for (const weak of weakSkills) {
    const cat = catMap.get(weak.skill);
    if (cat) {
      const match = allDrills.find(
        (d) => d.skill_category_id === cat.id && !selectedDrills.includes(d),
      );
      if (match) selectedDrills.push(match);
    }
  }

  // Add strength reinforcement
  for (const strong of strongSkills) {
    const cat = catMap.get(strong.skill);
    if (cat) {
      const match = allDrills.find(
        (d) => d.skill_category_id === cat.id && !selectedDrills.includes(d),
      );
      if (match) selectedDrills.push(match);
    }
  }

  // Fill remaining slots with random drills
  while (selectedDrills.length < 3 && allDrills.length > 0) {
    const remaining = allDrills.filter((d) => !selectedDrills.includes(d));
    if (remaining.length === 0) break;
    const random = remaining[Math.floor(Math.random() * remaining.length)];
    selectedDrills.push(random);
  }

  // Build plan drills JSON
  const planDrills = selectedDrills.map((d) => ({
    drill_id: d.id,
    title: d.title,
    skill_category: (d.skill_categories as { name: string })?.name ?? "General",
    difficulty: d.difficulty,
    status: "pending",
    completed_at: null,
    xp_earned: 0,
  }));

  // Insert plan
  const { data: plan, error } = await supabase
    .from("daily_training_plans")
    .insert({
      user_id: userId,
      org_id: user.org_id,
      plan_date: planDate,
      status: "pending",
      drills: planDrills,
    })
    .select("*")
    .single();

  if (error) return null;
  return plan;
}
