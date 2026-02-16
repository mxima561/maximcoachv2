import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createServiceClient } from "../lib/supabase.js";

const CreateSessionSchema = z.object({
  user_id: z.string().uuid(),
  org_id: z.string().uuid(),
  persona_id: z.string().uuid().optional(),
  scenario_type: z.enum(["cold_call", "discovery", "objection_handling", "closing"]),
  ip_address: z.string().optional(), // For trial tracking
});

export async function sessionRoutes(app: FastifyInstance) {
  async function handleCreateSession(
    request: { body: z.infer<typeof CreateSessionSchema>; ip?: string },
    reply: { code: (statusCode: number) => { send: (body: unknown) => void }; send: (body: unknown) => void },
  ) {
    const { user_id, org_id, persona_id, scenario_type, ip_address } =
      CreateSessionSchema.parse(request.body);

    const supabase = createServiceClient();

    // Create the session
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        user_id,
        org_id,
        persona_id,
        scenario_type,
        status: "pending",
      })
      .select()
      .single();

    if (sessionError || !session) {
      return reply.code(500).send({ error: "Failed to create session" });
    }

    // Track trial session if applicable
    const ipAddress = ip_address ?? request.ip;
    if (ipAddress) {
      await trackTrialSession(
        org_id,
        user_id,
        session.id,
        scenario_type,
        ipAddress
      );
    }

    return reply.send(session);
  }

  // Create a new session with trial tracking
  app.post<{ Body: z.infer<typeof CreateSessionSchema> }>(
    "/create",
    async (request, reply) => handleCreateSession(request, reply),
  );

  // PRD-compatible route
  app.post<{ Body: z.infer<typeof CreateSessionSchema> }>(
    "/api/sessions/create",
    async (request, reply) => handleCreateSession(request, reply),
  );
}

/**
 * Track trial session creation for analytics and abuse prevention
 */
async function trackTrialSession(
  organizationId: string,
  userId: string,
  sessionId: string,
  scenarioType: string,
  ipAddress: string,
): Promise<void> {
  const supabase = createServiceClient();

  // Get organization details
  const { data: org } = await supabase
    .from("organizations")
    .select("plan, trial_starts_at")
    .eq("id", organizationId)
    .single();

  // Only track if on trial plan
  if (org?.plan !== "trial") return;

  // Log trial session with full details for analytics
  await supabase.from("trial_sessions").insert({
    organization_id: organizationId,
    user_id: userId,
    session_id: sessionId,
    scenario_type: scenarioType,
    ip_address: ipAddress,
  });

  // Check if this is the first session
  const { count: sessionCount } = await supabase
    .from("trial_sessions")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (sessionCount === 1) {
    // Log first_session event
    const timeSinceStart = org.trial_starts_at
      ? Date.now() - new Date(org.trial_starts_at).getTime()
      : 0;

    await supabase.from("trial_events").insert({
      organization_id: organizationId,
      event_type: "first_session",
      metadata: {
        time_since_trial_start_ms: timeSinceStart,
        time_since_trial_start_hours: Math.floor(timeSinceStart / (1000 * 60 * 60)),
      },
    });
  }

  // Check if hitting the session limit (5 sessions)
  if (sessionCount === 5) {
    await supabase.from("trial_events").insert({
      organization_id: organizationId,
      event_type: "session_limit_hit",
      metadata: {
        ip_address: ipAddress,
      },
    });
  }
}
