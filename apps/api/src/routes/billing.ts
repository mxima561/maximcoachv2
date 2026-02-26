import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { z } from "zod";
import { requireAuth, requireOrgMembership } from "../lib/auth.js";
import { sendValidationError, sendForbidden } from "../lib/http-errors.js";
import { createServiceClient } from "../lib/supabase.js";
import { canAccess } from "@maxima/shared";
import type { Plan, Feature } from "@maxima/shared";

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    _stripe = new Stripe(key, { apiVersion: "2026-01-28.clover" });
  }
  return _stripe;
}

const PLANS = {
  solo: {
    name: "Solo",
    price: 2900, // $29.00 in cents
    priceId: process.env.STRIPE_SOLO_PRICE_ID || "",
    maxReps: 1,
    sessionsPerRep: -1, // unlimited
    totalSessions: -1, // unlimited
  },
  starter: {
    name: "Starter",
    price: 29900, // $299.00 in cents
    priceId: process.env.STRIPE_STARTER_PRICE_ID!,
    maxReps: 5,
    sessionsPerRep: 15,
    totalSessions: 75,
  },
  growth: {
    name: "Growth",
    price: 59900, // $599.00 in cents
    priceId: process.env.STRIPE_GROWTH_PRICE_ID || process.env.STRIPE_GROWTH_PRICE || "",
    maxReps: 15,
    sessionsPerRep: 15,
    totalSessions: 225,
  },
  scale: {
    name: "Scale",
    price: 99900, // $999.00 in cents
    priceId: process.env.STRIPE_SCALE_PRICE_ID!,
    maxReps: 30,
    sessionsPerRep: 20,
    totalSessions: 600,
  },
  enterprise: {
    name: "Enterprise",
    price: 150000, // $1,500.00+ in cents (starting price)
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID!,
    maxReps: -1, // unlimited
    sessionsPerRep: -1, // unlimited
    totalSessions: -1, // unlimited
  },
} as const;

const CheckoutSchema = z.object({
  org_id: z.string().uuid(),
  plan: z.enum(["solo", "starter", "growth", "scale", "enterprise"]),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});

const PortalSchema = z.object({
  org_id: z.string().uuid(),
  return_url: z.string().url(),
});

const UsageCheckSchema = z.object({
  org_id: z.string().uuid(),
});

export async function billingRoutes(app: FastifyInstance) {
  if (!process.env.STRIPE_SECRET_KEY) {
    app.log.warn("STRIPE_SECRET_KEY not set — billing routes disabled");
    return;
  }

  const supabase = createServiceClient();

  // Create checkout session for new subscription
  app.post("/api/billing/checkout", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const parsed = CheckoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    const body = parsed.data;
    const plan = PLANS[body.plan];
    if (!plan.priceId) {
      return reply.status(500).send({
        code: "BILLING_CONFIG_ERROR",
        message: `Missing Stripe price configuration for plan: ${body.plan}`,
      });
    }

    const membership = await requireOrgMembership(reply, body.org_id, auth.userId);
    if (!membership) return;

    // Get or create Stripe customer
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, stripe_customer_id")
      .eq("id", body.org_id)
      .single();

    if (!org) {
      return reply.status(404).send({ error: "Organization not found" });
    }

    let customerId = org.stripe_customer_id;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        name: org.name,
        metadata: { org_id: org.id },
      });
      customerId = customer.id;

      await supabase
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", org.id);
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: plan.priceId,
          quantity: 1, // Fixed quantity per plan tier
        },
      ],
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      metadata: { org_id: org.id, plan: body.plan },
      subscription_data: {
        metadata: { org_id: org.id, plan: body.plan },
      },
    });

    return { url: session.url };
  });

  // Create customer portal session
  app.post("/api/billing/portal", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const parsed = PortalSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    const body = parsed.data;
    const membership = await requireOrgMembership(reply, body.org_id, auth.userId);
    if (!membership) return;

    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", body.org_id)
      .single();

    if (!org?.stripe_customer_id) {
      return reply
        .status(400)
        .send({ error: "No billing account for this organization" });
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: body.return_url,
    });

    return { url: session.url };
  });

  // Check usage against plan limits
  app.get("/api/billing/usage", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const parsed = UsageCheckSchema.safeParse(request.query);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    const query = parsed.data;
    const membership = await requireOrgMembership(reply, query.org_id, auth.userId);
    if (!membership) return;

    const { data: org } = await supabase
      .from("organizations")
      .select("plan")
      .eq("id", query.org_id)
      .single();

    if (!org) {
      return reply.status(404).send({ error: "Organization not found" });
    }

    // Count sessions this billing period (current month)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: orgUsers } = await supabase
      .from("organization_users")
      .select("user_id")
      .eq("organization_id", query.org_id);

    const userIds = orgUsers?.map((u) => u.user_id) ?? [];

    let sessionCount = 0;
    if (userIds.length > 0) {
      const { count } = await supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .in("user_id", userIds)
        .gte("created_at", startOfMonth.toISOString());

      sessionCount = count ?? 0;
    }

    const planKey = org.plan as keyof typeof PLANS;
    const planConfig = PLANS[planKey] ?? null;
    const limit = planConfig?.totalSessions ?? 10; // free tier: 10 sessions

    return {
      plan: org.plan,
      sessions_used: sessionCount,
      session_limit: limit === -1 ? null : limit,
      max_reps: planConfig?.maxReps ?? 1,
      sessions_per_rep: planConfig?.sessionsPerRep ?? 10,
      is_within_limit: limit === -1 || sessionCount < limit,
    };
  });

  // Check feature access for a given org
  const FeatureCheckSchema = z.object({
    org_id: z.string().uuid(),
    feature: z.string(),
  });

  app.get("/api/billing/feature-check", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const parsed = FeatureCheckSchema.safeParse(request.query);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    const { org_id, feature } = parsed.data;
    const membership = await requireOrgMembership(reply, org_id, auth.userId);
    if (!membership) return;

    const { data: org } = await supabase
      .from("organizations")
      .select("plan")
      .eq("id", org_id)
      .single();

    if (!org) {
      return reply.status(404).send({ error: "Organization not found" });
    }

    const allowed = canAccess(org.plan as Plan, feature as Feature);
    return { feature, plan: org.plan, allowed };
  });

  // Stripe webhook handler
  app.post(
    "/api/billing/webhook",
    {
      config: {
        rawBody: true,
      },
    },
    async (request, reply) => {
      const sig = request.headers["stripe-signature"] as string;
      const rawBody = (request as unknown as { rawBody: Buffer }).rawBody;

      let event: Stripe.Event;
      try {
        event = getStripe().webhooks.constructEvent(
          rawBody,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET!,
        );
      } catch {
        return reply.status(400).send({ error: "Invalid signature" });
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const orgId = session.metadata?.org_id;
          const plan = session.metadata?.plan;

          if (orgId && plan && session.mode === "subscription") {
            // Get trial stats before cleanup
            const { count: sessionsUsed } = await supabase
              .from("trial_sessions")
              .select("*", { count: "exact", head: true })
              .eq("organization_id", orgId);

            const { data: org } = await supabase
              .from("organizations")
              .select("trial_starts_at")
              .eq("id", orgId)
              .single();

            const daysIntoTrial = org?.trial_starts_at
              ? Math.floor(
                  (Date.now() - new Date(org.trial_starts_at).getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              : 0;

            // Delete all trial sessions (cleanup)
            await supabase
              .from("trial_sessions")
              .delete()
              .eq("organization_id", orgId);

            // Log upgrade event with conversion metrics
            await supabase.from("trial_events").insert({
              organization_id: orgId,
              event_type: "upgraded",
              metadata: {
                sessions_used: sessionsUsed || 0,
                days_into_trial: daysIntoTrial,
                trigger: "checkout_completed",
                plan: plan,
                stripe_session_id: session.id,
              },
            });

            // Update organization with new plan
            await supabase
              .from("organizations")
              .update({
                plan,
                stripe_customer_id: session.customer as string,
                plan_updated_at: new Date().toISOString(),
              })
              .eq("id", orgId);
          }
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const orgId = subscription.metadata?.org_id;
          const plan = subscription.metadata?.plan;

          if (orgId && plan && subscription.status === "active") {
            await supabase
              .from("organizations")
              .update({ plan })
              .eq("id", orgId);
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const orgId = subscription.metadata?.org_id;

          if (orgId) {
            await supabase
              .from("organizations")
              .update({ plan: "free" })
              .eq("id", orgId);
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          // Find org by customer ID
          const { data: org } = await supabase
            .from("organizations")
            .select("id, payment_failed_at, payment_failure_count, plan")
            .eq("stripe_customer_id", customerId)
            .single();

          if (org) {
            app.log.warn(
              { org_id: org.id, invoice_id: invoice.id },
              "Invoice payment failed",
            );

            // If this is the first failure, set payment_failed_at
            if (!org.payment_failed_at) {
              await supabase
                .from("organizations")
                .update({
                  payment_failed_at: new Date().toISOString(),
                  payment_failure_count: 1,
                })
                .eq("id", org.id);

              // TODO: Send email notification about payment failure
              app.log.info(
                { org_id: org.id },
                "Grace period started - 7 days to update payment",
              );
            } else {
              // Increment failure count
              await supabase
                .from("organizations")
                .update({
                  payment_failure_count: (org.payment_failure_count || 0) + 1,
                })
                .eq("id", org.id);

              // Check if grace period (7 days) has expired
              const failedAt = new Date(org.payment_failed_at);
              const daysSinceFailure = Math.floor(
                (Date.now() - failedAt.getTime()) / (1000 * 60 * 60 * 24)
              );

              if (daysSinceFailure >= 7) {
                // Grace period expired - downgrade to free
                await supabase
                  .from("organizations")
                  .update({
                    plan: "free",
                    payment_failed_at: null,
                    payment_failure_count: 0,
                    plan_updated_at: new Date().toISOString(),
                  })
                  .eq("id", org.id);

                app.log.warn(
                  { org_id: org.id, previous_plan: org.plan },
                  "Downgraded to free plan after 7-day grace period",
                );

                // TODO: Send email notification about downgrade
              }
            }
          }
          break;
        }

        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          // Clear payment failure tracking on successful payment
          const { data: org } = await supabase
            .from("organizations")
            .select("id, payment_failed_at")
            .eq("stripe_customer_id", customerId)
            .single();

          if (org?.payment_failed_at) {
            await supabase
              .from("organizations")
              .update({
                payment_failed_at: null,
                payment_failure_count: 0,
              })
              .eq("id", org.id);

            app.log.info({ org_id: org.id }, "Payment recovered");
          }
          break;
        }
      }

      return { received: true };
    },
  );
}
