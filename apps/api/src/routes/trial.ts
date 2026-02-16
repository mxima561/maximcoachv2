import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createServiceClient } from "../lib/supabase.js";

const CheckTrialSchema = z.object({
  user_id: z.string().uuid(),
  ip_address: z.string(),
});

type CheckTrialResponse = {
  allowed: boolean;
  reason?:
    | "trial_expired"
    | "trial_admin_only"
    | "ip_limit_reached"
    | "upgrade_required"
    | "no_organization";
};

const TrackUpgradeClickSchema = z.object({
  org_id: z.string().uuid(),
  source: z.enum(["pricing_page", "trial_banner", "billing_page", "session_blocked"]),
  plan: z.string().optional(),
});

export async function trialRoutes(app: FastifyInstance) {
  // Track upgrade button clicks for analytics
  app.post<{ Body: z.infer<typeof TrackUpgradeClickSchema> }>(
    "/track-upgrade-click",
    async (request, reply) => {
      const { org_id, source, plan } = TrackUpgradeClickSchema.parse(request.body);
      const supabase = createServiceClient();

      await supabase.from("trial_events").insert({
        organization_id: org_id,
        event_type: "upgrade_clicked",
        metadata: {
          source,
          plan_clicked: plan,
          timestamp: new Date().toISOString(),
        },
      });

      return reply.send({ success: true });
    },
  );

  async function handleCheckTrial(
    request: { body: z.infer<typeof CheckTrialSchema> },
    reply: { send: (body: CheckTrialResponse) => void },
  ) {
    const { user_id, ip_address } = CheckTrialSchema.parse(request.body);

    const supabase = createServiceClient();

    // Get user's organization
    const { data: orgUsers, error: orgUserError } = await supabase
      .from("organization_users")
      .select("organization_id, role")
      .eq("user_id", user_id)
      .limit(1);

    if (orgUserError || !orgUsers || orgUsers.length === 0) {
      return reply.send({
        allowed: false,
        reason: "no_organization",
      } satisfies CheckTrialResponse);
    }

    const orgUser = orgUsers[0];

    // Get organization details
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("plan, trial_ends_at")
      .eq("id", orgUser.organization_id)
      .single();

    if (orgError || !org) {
      return reply.send({
        allowed: false,
        reason: "no_organization",
      } satisfies CheckTrialResponse);
    }

    // Paid plans bypass all checks
    if (["starter", "growth", "scale", "enterprise"].includes(org.plan)) {
      return reply.send({ allowed: true } satisfies CheckTrialResponse);
    }

    // Free plan requires upgrade
    if (org.plan === "free") {
      return reply.send({
        allowed: false,
        reason: "upgrade_required",
      } satisfies CheckTrialResponse);
    }

    // Trial plan checks
    if (org.plan === "trial") {
      // Check expiration
      if (org.trial_ends_at && new Date(org.trial_ends_at) < new Date()) {
        // Log trial_expired event (only log once per org)
        const { count: expiredEventCount } = await supabase
          .from("trial_events")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgUser.organization_id)
          .eq("event_type", "trial_expired");

        if (!expiredEventCount || expiredEventCount === 0) {
          const daysSinceExpiry = Math.floor(
            (Date.now() - new Date(org.trial_ends_at).getTime()) / (1000 * 60 * 60 * 24)
          );

          await supabase.from("trial_events").insert({
            organization_id: orgUser.organization_id,
            event_type: "trial_expired",
            metadata: {
              days_since_expiry: daysSinceExpiry,
              attempted_by_user: user_id,
            },
          });
        }

        return reply.send({
          allowed: false,
          reason: "trial_expired",
        } satisfies CheckTrialResponse);
      }

      // Only admins can create sessions during trial
      if (orgUser.role !== "admin") {
        return reply.send({
          allowed: false,
          reason: "trial_admin_only",
        } satisfies CheckTrialResponse);
      }

      // Check org-wide session limit (5 total) and IP-based limit (5 per IP)
      const { count: orgCount } = await supabase
        .from("trial_sessions")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgUser.organization_id);

      if (orgCount && orgCount >= 5) {
        return reply.send({
          allowed: false,
          reason: "ip_limit_reached",
        } satisfies CheckTrialResponse);
      }

      const { count } = await supabase
        .from("trial_sessions")
        .select("*", { count: "exact", head: true })
        .eq("ip_address", ip_address);

      if (count && count >= 5) {
        return reply.send({
          allowed: false,
          reason: "ip_limit_reached",
        } satisfies CheckTrialResponse);
      }

      return reply.send({ allowed: true } satisfies CheckTrialResponse);
    }

    // Unknown plan type - deny
    return reply.send({
      allowed: false,
      reason: "upgrade_required",
    } satisfies CheckTrialResponse);
  }

  // Check if user can create a session based on trial status
  app.post<{ Body: z.infer<typeof CheckTrialSchema> }>(
    "/check-trial",
    async (request, reply) => handleCheckTrial(request, reply),
  );

  // PRD-compatible route
  app.post<{ Body: z.infer<typeof CheckTrialSchema> }>(
    "/api/sessions/check-trial",
    async (request, reply) => handleCheckTrial(request, reply),
  );
}
