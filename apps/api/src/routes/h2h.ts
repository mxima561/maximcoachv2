import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createServiceClient } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";
import { sendValidationError } from "../lib/http-errors.js";
import { randomUUID } from "crypto";

const CreateH2HSchema = z.object({
  opponent_id: z.string().uuid(),
  scenario_id: z.string().uuid().optional(),
  deadline_hours: z.number().int().min(1).max(168).default(48),
});

export async function h2hRoutes(app: FastifyInstance) {
  const supabase = createServiceClient();

  // GET /api/h2h — list user's matches
  app.get<{
    Querystring: { status?: string };
  }>("/api/h2h", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    let query = supabase
      .from("h2h_matches")
      .select("*, challenger:users!h2h_matches_challenger_id_fkey(name), opponent:users!h2h_matches_opponent_id_fkey(name)")
      .or(`challenger_id.eq.${auth.userId},opponent_id.eq.${auth.userId}`)
      .order("created_at", { ascending: false });

    if (request.query.status) {
      query = query.eq("status", request.query.status);
    }

    const { data, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send(data);
  });

  // POST /api/h2h — create challenge
  app.post<{ Body: z.infer<typeof CreateH2HSchema> }>("/api/h2h", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const parsed = CreateH2HSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    if (parsed.data.opponent_id === auth.userId) {
      return reply.status(400).send({ error: "Cannot challenge yourself" });
    }

    const { data: user } = await supabase
      .from("users")
      .select("org_id")
      .eq("id", auth.userId)
      .single();

    if (!user?.org_id) return reply.status(400).send({ error: "User has no org" });

    // Generate a shared persona seed for fairness
    const personaSeed = randomUUID();

    const deadline = new Date();
    deadline.setHours(deadline.getHours() + parsed.data.deadline_hours);

    const { data, error } = await supabase
      .from("h2h_matches")
      .insert({
        org_id: user.org_id,
        challenger_id: auth.userId,
        opponent_id: parsed.data.opponent_id,
        persona_seed: personaSeed,
        scenario_id: parsed.data.scenario_id ?? null,
        status: "pending",
        deadline: deadline.toISOString(),
      })
      .select("id, status, deadline")
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send(data);
  });

  // GET /api/h2h/:id — match detail
  app.get<{ Params: { id: string } }>("/api/h2h/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { data, error } = await supabase
      .from("h2h_matches")
      .select("*, challenger:users!h2h_matches_challenger_id_fkey(name), opponent:users!h2h_matches_opponent_id_fkey(name)")
      .eq("id", request.params.id)
      .single();

    if (error || !data) return reply.status(404).send({ error: "Match not found" });

    // Ensure user is participant
    if (data.challenger_id !== auth.userId && data.opponent_id !== auth.userId) {
      return reply.status(403).send({ error: "Not a participant" });
    }

    return reply.send(data);
  });

  // POST /api/h2h/:id/complete — submit session for h2h match
  app.post<{
    Params: { id: string };
    Body: { session_id: string; score: number };
  }>("/api/h2h/:id/complete", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { session_id, score } = request.body;
    if (!session_id || typeof score !== "number") {
      return reply.status(400).send({ error: "session_id and score required" });
    }

    const { data: match } = await supabase
      .from("h2h_matches")
      .select("*")
      .eq("id", request.params.id)
      .single();

    if (!match) return reply.status(404).send({ error: "Match not found" });

    const isChallenger = match.challenger_id === auth.userId;
    const isOpponent = match.opponent_id === auth.userId;

    if (!isChallenger && !isOpponent) {
      return reply.status(403).send({ error: "Not a participant" });
    }

    // Check deadline
    if (new Date() > new Date(match.deadline)) {
      return reply.status(400).send({ error: "Match deadline has passed" });
    }

    // Update match
    const updates: Record<string, unknown> = {};

    if (isChallenger) {
      if (match.challenger_session_id) {
        return reply.status(409).send({ error: "Already completed" });
      }
      updates.challenger_session_id = session_id;
      updates.challenger_score = score;
      updates.status = match.opponent_session_id ? "scored" : "challenger_completed";
    } else {
      if (match.opponent_session_id) {
        return reply.status(409).send({ error: "Already completed" });
      }
      updates.opponent_session_id = session_id;
      updates.opponent_score = score;
      updates.status = match.challenger_session_id ? "scored" : "opponent_completed";
    }

    // If both completed, determine winner
    if (updates.status === "scored") {
      const cScore = isChallenger ? score : match.challenger_score;
      const oScore = isOpponent ? score : match.opponent_score;

      if (cScore != null && oScore != null) {
        updates.winner_id = cScore >= oScore ? match.challenger_id : match.opponent_id;
        updates.scored_at = new Date().toISOString();
      }
    }

    const { error } = await supabase
      .from("h2h_matches")
      .update(updates)
      .eq("id", request.params.id);

    if (error) return reply.status(500).send({ error: error.message });

    return reply.send({
      status: updates.status,
      winner_id: updates.winner_id ?? null,
    });
  });
}
