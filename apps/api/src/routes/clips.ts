import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createServiceClient } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";
import { sendValidationError } from "../lib/http-errors.js";

const CreateClipSchema = z.object({
  session_id: z.string().uuid(),
  storage_path: z.string().min(1),
  start_time: z.number().min(0),
  end_time: z.number().min(0),
  title: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  ai_note: z.string().optional(),
});

const VALID_REACTIONS = ["fire", "clap", "mind_blown", "trophy", "thumbs_up"] as const;

export async function clipRoutes(app: FastifyInstance) {
  const supabase = createServiceClient();

  // GET /api/clips/feed — org clip feed
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>("/api/clips/feed", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { data: user } = await supabase
      .from("users")
      .select("org_id")
      .eq("id", auth.userId)
      .single();

    if (!user?.org_id) return reply.status(400).send({ error: "User has no org" });

    const limit = Math.min(Number(request.query.limit) || 20, 50);
    const offset = Number(request.query.offset) || 0;

    const { data, error } = await supabase
      .from("clips")
      .select("*, users(name)")
      .eq("org_id", user.org_id)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return reply.status(500).send({ error: error.message });

    // Get reaction counts for each clip
    const clipIds = (data ?? []).map((c) => c.id);
    const { data: reactions } = await supabase
      .from("clip_reactions")
      .select("clip_id, reaction")
      .in("clip_id", clipIds);

    const reactionMap = new Map<string, Record<string, number>>();
    for (const r of reactions ?? []) {
      const counts = reactionMap.get(r.clip_id) ?? {};
      counts[r.reaction] = (counts[r.reaction] ?? 0) + 1;
      reactionMap.set(r.clip_id, counts);
    }

    // Get user's own reactions
    const { data: myReactions } = await supabase
      .from("clip_reactions")
      .select("clip_id, reaction")
      .eq("user_id", auth.userId)
      .in("clip_id", clipIds);

    const myReactionMap = new Map<string, string[]>();
    for (const r of myReactions ?? []) {
      const arr = myReactionMap.get(r.clip_id) ?? [];
      arr.push(r.reaction);
      myReactionMap.set(r.clip_id, arr);
    }

    const feed = (data ?? []).map((clip) => ({
      ...clip,
      reaction_counts: reactionMap.get(clip.id) ?? {},
      my_reactions: myReactionMap.get(clip.id) ?? [],
    }));

    return reply.send(feed);
  });

  // POST /api/clips — create clip
  app.post<{ Body: z.infer<typeof CreateClipSchema> }>("/api/clips", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const parsed = CreateClipSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const { data: user } = await supabase
      .from("users")
      .select("org_id")
      .eq("id", auth.userId)
      .single();

    if (!user?.org_id) return reply.status(400).send({ error: "User has no org" });

    const { data, error } = await supabase
      .from("clips")
      .insert({
        ...parsed.data,
        user_id: auth.userId,
        org_id: user.org_id,
      })
      .select("id")
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send(data);
  });

  // POST /api/clips/:id/react — toggle reaction
  app.post<{
    Params: { id: string };
    Body: { reaction: string };
  }>("/api/clips/:id/react", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { reaction } = request.body;
    if (!VALID_REACTIONS.includes(reaction as typeof VALID_REACTIONS[number])) {
      return reply.status(400).send({ error: "Invalid reaction" });
    }

    // Toggle: check if exists → delete, else insert
    const { data: existing } = await supabase
      .from("clip_reactions")
      .select("id")
      .eq("clip_id", request.params.id)
      .eq("user_id", auth.userId)
      .eq("reaction", reaction)
      .single();

    if (existing) {
      await supabase.from("clip_reactions").delete().eq("id", existing.id);
      return reply.send({ action: "removed" });
    }

    const { error } = await supabase
      .from("clip_reactions")
      .insert({
        clip_id: request.params.id,
        user_id: auth.userId,
        reaction,
      });

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ action: "added" });
  });

  // DELETE /api/clips/:id — delete own clip
  app.delete<{ Params: { id: string } }>("/api/clips/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { error } = await supabase
      .from("clips")
      .delete()
      .eq("id", request.params.id)
      .eq("user_id", auth.userId);

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ deleted: true });
  });
}
