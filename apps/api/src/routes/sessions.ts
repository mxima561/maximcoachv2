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
  // Create a new session with trial tracking
  app.post<{ Body: z.infer<typeof CreateSessionSchema> }>(
    "/create",
    async (request, reply) => {
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
      if (ip_address) {
        await trackTrialSession(org_id, ip_address);
      }

      return reply.send(session);
    },
  );
}

/**
 * Track trial session creation for analytics and abuse prevention
 */
async function trackTrialSession(
  organizationId: string,
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

  // Log trial session with IP address
  await supabase.from("trial_sessions").insert({
    organization_id: organizationId,
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
