import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, requireOrgMembership } from "../lib/auth.js";
import { sendValidationError } from "../lib/http-errors.js";
import { createServiceClient } from "../lib/supabase.js";

const CreateSessionSchema = z.object({
  user_id: z.string().uuid().optional(),
  org_id: z.string().uuid(),
  persona_id: z.string().uuid().optional(),
  scenario_type: z.enum(["cold_call", "discovery", "objection_handling", "closing"]),
  ip_address: z.string().optional(), // For trial tracking
});

export async function sessionRoutes(app: FastifyInstance) {
  async function handleCreateSession(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const parsed = CreateSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    const { user_id, org_id, persona_id, scenario_type, ip_address } = parsed.data;
    if (user_id && user_id !== auth.userId) {
      return reply.status(403).send({
        code: "FORBIDDEN",
        message: "Cannot create sessions for a different user",
      });
    }

    const supabase = createServiceClient();
    const membership = await requireOrgMembership(reply, org_id, auth.userId);
    if (!membership) return;

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("plan, trial_ends_at")
      .eq("id", org_id)
      .single();

    if (orgError || !org) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "Organization not found" });
    }

    const ipAddress = ip_address ?? request.ip ?? "0.0.0.0";

    // Enforce trial restrictions server-side to prevent client bypasses.
    if (org.plan === "free") {
      return reply.status(403).send({
        code: "TRIAL_RESTRICTED",
        reason: "upgrade_required",
        message: "Please upgrade your plan to create sessions.",
      });
    }

    if (org.plan === "trial") {
      if (org.trial_ends_at && new Date(org.trial_ends_at) < new Date()) {
        return reply.status(403).send({
          code: "TRIAL_RESTRICTED",
          reason: "trial_expired",
          message: "Your trial has expired. Please upgrade to continue.",
        });
      }

      if (membership.role !== "admin") {
        return reply.status(403).send({
          code: "TRIAL_RESTRICTED",
          reason: "trial_admin_only",
          message: "Only admins can create sessions during trial.",
        });
      }

      const { count: orgCount } = await supabase
        .from("trial_sessions")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org_id);

      if ((orgCount ?? 0) >= 5) {
        return reply.status(403).send({
          code: "TRIAL_RESTRICTED",
          reason: "ip_limit_reached",
          message: "Trial session limit reached.",
        });
      }

      const { count: ipCount } = await supabase
        .from("trial_sessions")
        .select("*", { count: "exact", head: true })
        .eq("ip_address", ipAddress);

      if ((ipCount ?? 0) >= 5) {
        return reply.status(403).send({
          code: "TRIAL_RESTRICTED",
          reason: "ip_limit_reached",
          message: "Trial session limit reached.",
        });
      }
    }

    // Create the session
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        user_id: auth.userId,
        org_id,
        persona_id,
        scenario_type,
        status: "pending",
      })
      .select()
        .single();

    if (sessionError || !session) {
      return reply.status(500).send({
        code: "SESSION_CREATE_FAILED",
        message: "Failed to create session",
      });
    }

    // Track trial session if applicable
    if (ipAddress && org.plan === "trial") {
      await trackTrialSession(
        org_id,
        auth.userId,
        session.id,
        scenario_type,
        ipAddress
      );
    }

    return reply.send(session);
  }

  // Create a new session with trial tracking
  app.post(
    "/create",
    async (request, reply) => handleCreateSession(request, reply),
  );

  // PRD-compatible route
  app.post(
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
