import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createServiceClient } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";
import { sendValidationError } from "../lib/http-errors.js";
import { getGamificationQueue } from "../lib/queues.js";

const UploadTranscriptSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  raw_text: z.string().min(50).max(100000),
  source: z.enum(["upload", "paste", "api", "recording"]).optional(),
  duration_seconds: z.number().int().positive().optional(),
});

export async function transcriptRoutes(app: FastifyInstance) {
  const supabase = createServiceClient();

  // POST /api/transcripts — upload a call transcript
  app.post<{ Body: z.infer<typeof UploadTranscriptSchema> }>(
    "/api/transcripts",
    async (request, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      const parsed = UploadTranscriptSchema.safeParse(request.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);

      const { data: user } = await supabase
        .from("users")
        .select("org_id")
        .eq("id", auth.userId)
        .single();

      if (!user?.org_id) return reply.status(400).send({ error: "User has no org" });

      const { data, error } = await supabase
        .from("call_transcripts")
        .insert({
          user_id: auth.userId,
          org_id: user.org_id,
          title: parsed.data.title ?? "Uploaded Call",
          raw_text: parsed.data.raw_text,
          source: parsed.data.source ?? "upload",
          duration_seconds: parsed.data.duration_seconds ?? null,
          status: "pending",
        })
        .select("id, status, created_at")
        .single();

      if (error) return reply.status(500).send({ error: error.message });

      // Queue async analysis
      const queue = getGamificationQueue();
      if (queue) {
        await queue.add("transcript-analysis", {
          transcript_id: data.id,
          user_id: auth.userId,
          org_id: user.org_id,
        });
      }

      return reply.status(201).send(data);
    },
  );

  // GET /api/transcripts — list user's transcripts
  app.get<{
    Querystring: { status?: string; limit?: string };
  }>("/api/transcripts", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const limit = Math.min(Number(request.query.limit) || 20, 100);

    let query = supabase
      .from("call_transcripts")
      .select("id, title, source, status, duration_seconds, created_at, analysis")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (request.query.status) {
      query = query.eq("status", request.query.status);
    }

    const { data, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });

    // Strip raw analysis for list view, keep summary
    const items = (data ?? []).map((t) => ({
      ...t,
      analysis: t.analysis
        ? {
            summary: (t.analysis as Record<string, unknown>).summary,
            overall_rating: (t.analysis as Record<string, unknown>).overall_rating,
            weakness_count: ((t.analysis as Record<string, unknown>).weaknesses as unknown[] | undefined)?.length ?? 0,
          }
        : null,
    }));

    return reply.send(items);
  });

  // GET /api/transcripts/:id — full transcript with analysis
  app.get<{ Params: { id: string } }>("/api/transcripts/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { data, error } = await supabase
      .from("call_transcripts")
      .select("*")
      .eq("id", request.params.id)
      .eq("user_id", auth.userId)
      .single();

    if (error || !data) return reply.status(404).send({ error: "Transcript not found" });
    return reply.send(data);
  });

  // POST /api/transcripts/:id/analyze — trigger re-analysis
  app.post<{ Params: { id: string } }>("/api/transcripts/:id/analyze", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { data: transcript } = await supabase
      .from("call_transcripts")
      .select("id, user_id, org_id, status")
      .eq("id", request.params.id)
      .eq("user_id", auth.userId)
      .single();

    if (!transcript) return reply.status(404).send({ error: "Transcript not found" });

    // Update status to processing
    await supabase
      .from("call_transcripts")
      .update({ status: "processing", analysis: null, error_message: null })
      .eq("id", transcript.id);

    // Queue analysis
    const queue = getGamificationQueue();
    if (queue) {
      await queue.add("transcript-analysis", {
        transcript_id: transcript.id,
        user_id: auth.userId,
        org_id: transcript.org_id,
      });
    }

    return reply.send({ status: "processing" });
  });
}
