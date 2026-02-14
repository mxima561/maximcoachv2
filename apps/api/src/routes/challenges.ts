import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createServiceClient } from "../lib/supabase.js";

const GOAL_TYPES = [
  "sessions_completed",
  "avg_score_above",
  "specific_scenario_count",
] as const;

const CreateChallengeSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  goal_type: z.enum(GOAL_TYPES),
  goal_value: z.number().int().min(1),
  timeframe_weeks: z.number().int().min(1).max(4),
  scenario_constraints: z.array(z.string()).optional(),
  reward: z.string().optional(),
  org_id: z.string().uuid(),
});

export async function challengeRoutes(app: FastifyInstance) {
  const supabase = createServiceClient();

  // List active challenges for org
  app.get<{ Querystring: { org_id: string } }>(
    "/api/challenges",
    async (request, reply) => {
      const orgId = request.query.org_id;
      if (!orgId) return reply.status(400).send({ error: "org_id required" });

      const { data, error } = await supabase
        .from("challenges")
        .select("*, challenge_entries(count)")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (error) return reply.status(500).send({ error: error.message });
      return reply.send(data);
    },
  );

  // Create challenge
  app.post<{ Body: z.infer<typeof CreateChallengeSchema> }>(
    "/api/challenges",
    async (request, reply) => {
      const parsed = CreateChallengeSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.status(400).send({ error: parsed.error.format() });

      const { timeframe_weeks, ...rest } = parsed.data;
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + timeframe_weeks * 7);

      const { data, error } = await supabase
        .from("challenges")
        .insert({
          ...rest,
          status: "active",
          end_date: endDate.toISOString(),
        })
        .select("id")
        .single();

      if (error) return reply.status(500).send({ error: error.message });
      return reply.status(201).send(data);
    },
  );

  // Get challenge with entries
  app.get<{ Params: { id: string } }>(
    "/api/challenges/:id",
    async (request, reply) => {
      const { id } = request.params;

      const { data: challenge, error } = await supabase
        .from("challenges")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !challenge)
        return reply.status(404).send({ error: "Challenge not found" });

      const { data: entries } = await supabase
        .from("challenge_entries")
        .select("*, users(name)")
        .eq("challenge_id", id)
        .order("progress", { ascending: false });

      return reply.send({ ...challenge, entries: entries ?? [] });
    },
  );

  // Join challenge
  app.post<{ Params: { id: string }; Body: { user_id: string } }>(
    "/api/challenges/:id/join",
    async (request, reply) => {
      const { id } = request.params;
      const { user_id } = request.body;

      if (!user_id)
        return reply.status(400).send({ error: "user_id required" });

      // Check if already joined
      const { data: existing } = await supabase
        .from("challenge_entries")
        .select("id")
        .eq("challenge_id", id)
        .eq("user_id", user_id)
        .single();

      if (existing) return reply.status(409).send({ error: "Already joined" });

      const { data, error } = await supabase
        .from("challenge_entries")
        .insert({
          challenge_id: id,
          user_id,
          progress: 0,
          completed: false,
        })
        .select("id")
        .single();

      if (error) return reply.status(500).send({ error: error.message });
      return reply.status(201).send(data);
    },
  );
}
