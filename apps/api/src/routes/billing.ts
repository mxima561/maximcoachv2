import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { z } from "zod";
import { createServiceClient } from "../lib/supabase.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

const PLANS = {
  growth: {
    name: "Growth",
    pricePerRep: 6900, // $69.00 in cents
    priceId: process.env.STRIPE_GROWTH_PRICE_ID!,
    sessionLimit: 50,
  },
  pro: {
    name: "Pro",
    pricePerRep: 9900, // $99.00 in cents
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
    sessionLimit: -1, // unlimited
  },
} as const;

const CheckoutSchema = z.object({
  org_id: z.string().uuid(),
  plan: z.enum(["growth", "pro"]),
  quantity: z.number().int().min(1),
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
  const supabase = createServiceClient();

  // Create checkout session for new subscription
  app.post("/api/billing/checkout", async (request, reply) => {
    const body = CheckoutSchema.parse(request.body);
    const plan = PLANS[body.plan];

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
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: { org_id: org.id },
      });
      customerId = customer.id;

      await supabase
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", org.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: plan.priceId,
          quantity: body.quantity,
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
    const body = PortalSchema.parse(request.body);

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

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: body.return_url,
    });

    return { url: session.url };
  });

  // Check usage against plan limits
  app.get("/api/billing/usage", async (request, reply) => {
    const query = UsageCheckSchema.parse(request.query);

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
      .from("users")
      .select("id")
      .eq("org_id", query.org_id);

    const userIds = orgUsers?.map((u) => u.id) ?? [];

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
    const limit = planConfig?.sessionLimit ?? 10; // free tier: 10 sessions

    return {
      plan: org.plan,
      sessions_used: sessionCount,
      session_limit: limit === -1 ? null : limit,
      is_within_limit: limit === -1 || sessionCount < limit,
    };
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
        event = stripe.webhooks.constructEvent(
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

          if (orgId && plan) {
            await supabase
              .from("organizations")
              .update({
                plan,
                stripe_customer_id: session.customer as string,
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

          // Find org by customer ID and log the failure
          const { data: org } = await supabase
            .from("organizations")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .single();

          if (org) {
            app.log.warn(
              { org_id: org.id, invoice_id: invoice.id },
              "Invoice payment failed",
            );
          }
          break;
        }
      }

      return { received: true };
    },
  );
}
