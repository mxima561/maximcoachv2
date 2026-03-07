import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createServiceClient } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";
import { sendValidationError } from "../lib/http-errors.js";

const UpdatePrefsSchema = z.object({
  push_enabled: z.boolean().optional(),
  email_weekly_report: z.boolean().optional(),
  email_streak_warning: z.boolean().optional(),
  slack_enabled: z.boolean().optional(),
  daily_reminder_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  streak_warning_enabled: z.boolean().optional(),
  challenge_updates: z.boolean().optional(),
});

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export async function notificationRoutes(app: FastifyInstance) {
  const supabase = createServiceClient();

  // GET /api/notifications/preferences
  app.get("/api/notifications/preferences", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { data } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", auth.userId)
      .single();

    if (!data) {
      // Create defaults
      const { data: created } = await supabase
        .from("notification_preferences")
        .insert({ user_id: auth.userId })
        .select("*")
        .single();
      return reply.send(created);
    }

    return reply.send(data);
  });

  // PATCH /api/notifications/preferences
  app.patch<{ Body: z.infer<typeof UpdatePrefsSchema> }>(
    "/api/notifications/preferences",
    async (request, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      const parsed = UpdatePrefsSchema.safeParse(request.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);

      // Upsert preferences
      const { data, error } = await supabase
        .from("notification_preferences")
        .upsert(
          { user_id: auth.userId, ...parsed.data, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        )
        .select("*")
        .single();

      if (error) return reply.status(500).send({ error: error.message });
      return reply.send(data);
    },
  );

  // POST /api/notifications/push-subscribe
  app.post<{ Body: z.infer<typeof PushSubscriptionSchema> }>(
    "/api/notifications/push-subscribe",
    async (request, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      const parsed = PushSubscriptionSchema.safeParse(request.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);

      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: auth.userId,
            endpoint: parsed.data.endpoint,
            p256dh: parsed.data.keys.p256dh,
            auth: parsed.data.keys.auth,
          },
          { onConflict: "user_id,endpoint" },
        );

      if (error) return reply.status(500).send({ error: error.message });
      return reply.send({ subscribed: true });
    },
  );

  // DELETE /api/notifications/push-subscribe
  app.delete<{ Body: { endpoint: string } }>(
    "/api/notifications/push-subscribe",
    async (request, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", auth.userId)
        .eq("endpoint", request.body.endpoint);

      return reply.send({ unsubscribed: true });
    },
  );
}
