import type { FastifyInstance } from "fastify";
import { createServiceClient } from "../lib/supabase.js";
import { crmSyncQueue } from "../lib/queues.js";

const HS_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID || "";
const HS_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET || "";
const HS_REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI || "";

export async function hubspotRoutes(app: FastifyInstance) {
  const supabase = createServiceClient();

  // Initiate OAuth
  app.get<{ Querystring: { org_id: string } }>(
    "/api/integrations/hubspot/auth",
    async (request, reply) => {
      const { org_id } = request.query;
      if (!org_id) return reply.status(400).send({ error: "org_id required" });

      const state = Buffer.from(JSON.stringify({ org_id })).toString(
        "base64url",
      );

      const params = new URLSearchParams({
        client_id: HS_CLIENT_ID,
        redirect_uri: HS_REDIRECT_URI,
        scope: "crm.objects.contacts.read crm.objects.deals.read",
        state,
      });

      return reply.redirect(
        `https://app.hubspot.com/oauth/authorize?${params}`,
      );
    },
  );

  // OAuth callback
  app.get<{ Querystring: { code: string; state: string } }>(
    "/api/integrations/hubspot/callback",
    async (request, reply) => {
      const { code, state } = request.query;

      let parsedState: { org_id: string };
      try {
        parsedState = JSON.parse(
          Buffer.from(state, "base64url").toString("utf-8"),
        );
      } catch {
        return reply.status(400).send({ error: "Invalid state" });
      }

      const tokenRes = await fetch("https://api.hubapi.com/oauth/v1/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: HS_CLIENT_ID,
          client_secret: HS_CLIENT_SECRET,
          redirect_uri: HS_REDIRECT_URI,
          code,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return reply
          .status(400)
          .send({ error: `Token exchange failed: ${err}` });
      }

      const tokens = (await tokenRes.json()) as {
        access_token: string;
        refresh_token: string;
      };

      const { error } = await supabase.from("integrations").upsert(
        {
          org_id: parsedState.org_id,
          provider: "hubspot",
          access_token_encrypted: tokens.access_token,
          refresh_token_encrypted: tokens.refresh_token,
          instance_url: "https://api.hubapi.com",
          status: "connected",
          last_sync: null,
          records_synced: 0,
          sync_errors: null,
        },
        { onConflict: "org_id,provider" },
      );

      if (error) return reply.status(500).send({ error: error.message });

      await crmSyncQueue.add("hubspot-sync", {
        org_id: parsedState.org_id,
        provider: "hubspot",
      });

      const webUrl = process.env.WEB_ORIGIN || "http://localhost:3000";
      return reply.redirect(
        `${webUrl}/settings/integrations?connected=hubspot`,
      );
    },
  );

  // Disconnect
  app.delete<{ Params: { org_id: string } }>(
    "/api/integrations/hubspot/:org_id",
    async (request, reply) => {
      const { org_id } = request.params;

      const { error } = await supabase
        .from("integrations")
        .delete()
        .eq("org_id", org_id)
        .eq("provider", "hubspot");

      if (error) return reply.status(500).send({ error: error.message });
      return reply.send({ success: true });
    },
  );

  // Manual sync
  app.post<{ Body: { org_id: string } }>(
    "/api/integrations/hubspot/sync",
    async (request, reply) => {
      const { org_id } = request.body;
      if (!org_id) return reply.status(400).send({ error: "org_id required" });

      await crmSyncQueue.add("hubspot-sync", {
        org_id,
        provider: "hubspot",
      });

      return reply.send({ status: "queued" });
    },
  );

  // Status
  app.get<{ Params: { org_id: string } }>(
    "/api/integrations/hubspot/:org_id/status",
    async (request, reply) => {
      const { org_id } = request.params;

      const { data, error } = await supabase
        .from("integrations")
        .select("status, last_sync, records_synced, sync_errors")
        .eq("org_id", org_id)
        .eq("provider", "hubspot")
        .single();

      if (error || !data)
        return reply.send({
          status: "disconnected",
          last_sync: null,
          records_synced: 0,
        });

      return reply.send(data);
    },
  );
}
