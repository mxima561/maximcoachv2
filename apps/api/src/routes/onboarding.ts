import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createServiceClient } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";
import { sendValidationError } from "../lib/http-errors.js";

const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export async function onboardingRoutes(app: FastifyInstance) {
  app.post("/api/onboarding/create-organization", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const parsed = createOrganizationSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    const supabase = createServiceClient();

    const { data: existingMembership, error: existingMembershipError } =
      await supabase
        .from("organization_users")
        .select("organization_id")
        .eq("user_id", auth.userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (existingMembershipError) {
      request.log.error(
        { err: existingMembershipError, userId: auth.userId },
        "failed to read existing organization membership",
      );
      return reply.status(500).send({
        code: "ONBOARDING_LOOKUP_FAILED",
        message: "Could not verify onboarding status",
      });
    }

    if (existingMembership?.organization_id) {
      return reply.status(200).send({
        organization_id: existingMembership.organization_id,
        created: false,
      });
    }

    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .insert({
        name: parsed.data.name,
        plan: "trial",
        trial_starts_at: now.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
        plan_updated_at: now.toISOString(),
      })
      .select("id")
      .single();

    if (organizationError || !organization) {
      request.log.error(
        { err: organizationError, userId: auth.userId },
        "failed to create organization during onboarding",
      );
      return reply.status(500).send({
        code: "ONBOARDING_ORG_CREATE_FAILED",
        message: "Could not create organization",
      });
    }

    const { error: memberError } = await supabase.from("organization_users").insert({
      organization_id: organization.id,
      user_id: auth.userId,
      role: "admin",
    });

    if (memberError) {
      request.log.error(
        {
          err: memberError,
          organizationId: organization.id,
          userId: auth.userId,
        },
        "failed to create initial organization membership",
      );
      await supabase.from("organizations").delete().eq("id", organization.id);
      return reply.status(500).send({
        code: "ONBOARDING_MEMBERSHIP_CREATE_FAILED",
        message: "Could not create organization membership",
      });
    }

    const { error: trialEventError } = await supabase.from("trial_events").insert({
      organization_id: organization.id,
      event_type: "trial_started",
      metadata: {
        source: "onboarding",
        user_email: auth.email,
        org_name: parsed.data.name,
      },
    });

    if (trialEventError) {
      request.log.warn(
        {
          err: trialEventError,
          organizationId: organization.id,
          userId: auth.userId,
        },
        "failed to write trial_started event",
      );
    }

    return reply.status(201).send({
      organization_id: organization.id,
      created: true,
    });
  });
}
