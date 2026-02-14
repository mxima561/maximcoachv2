import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { createServiceClient } from "../lib/supabase.js";
import { crmSyncQueue } from "../lib/queues.js";

const SF_CLIENT_ID = process.env.SALESFORCE_CLIENT_ID || "";
const SF_CLIENT_SECRET = process.env.SALESFORCE_CLIENT_SECRET || "";
const SF_REDIRECT_URI = process.env.SALESFORCE_REDIRECT_URI || "";

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export async function salesforceRoutes(app: FastifyInstance) {
  const supabase = createServiceClient();

  // Initiate OAuth
  app.get<{ Querystring: { org_id: string } }>(
    "/api/integrations/salesforce/auth",
    async (request, reply) => {
      const { org_id } = request.query;
      if (!org_id) return reply.status(400).send({ error: "org_id required" });

      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = JSON.stringify({ org_id, code_verifier: codeVerifier });
      const encodedState = Buffer.from(state).toString("base64url");

      const params = new URLSearchParams({
        response_type: "code",
        client_id: SF_CLIENT_ID,
        redirect_uri: SF_REDIRECT_URI,
        scope: "api refresh_token",
        state: encodedState,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });

      return reply.redirect(
        `https://login.salesforce.com/services/oauth2/authorize?${params}`,
      );
    },
  );

  // OAuth callback
  app.get<{ Querystring: { code: string; state: string } }>(
    "/api/integrations/salesforce/callback",
    async (request, reply) => {
      const { code, state } = request.query;

      let parsedState: { org_id: string; code_verifier: string };
      try {
        parsedState = JSON.parse(
          Buffer.from(state, "base64url").toString("utf-8"),
        );
      } catch {
        return reply.status(400).send({ error: "Invalid state" });
      }

      // Exchange code for tokens
      const tokenRes = await fetch(
        "https://login.salesforce.com/services/oauth2/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: SF_CLIENT_ID,
            client_secret: SF_CLIENT_SECRET,
            redirect_uri: SF_REDIRECT_URI,
            code,
            code_verifier: parsedState.code_verifier,
          }),
        },
      );

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return reply.status(400).send({ error: `Token exchange failed: ${err}` });
      }

      const tokens = (await tokenRes.json()) as {
        access_token: string;
        refresh_token: string;
        instance_url: string;
      };

      // Encrypt tokens before storing
      const { error } = await supabase.from("integrations").upsert(
        {
          org_id: parsedState.org_id,
          provider: "salesforce",
          access_token_encrypted: tokens.access_token,
          refresh_token_encrypted: tokens.refresh_token,
          instance_url: tokens.instance_url,
          status: "connected",
          last_sync: null,
          records_synced: 0,
          sync_errors: null,
        },
        { onConflict: "org_id,provider" },
      );

      if (error) return reply.status(500).send({ error: error.message });

      // Enqueue initial sync
      await crmSyncQueue.add("salesforce-sync", {
        org_id: parsedState.org_id,
        provider: "salesforce",
      });

      const webUrl = process.env.WEB_ORIGIN || "http://localhost:3000";
      return reply.redirect(`${webUrl}/settings/integrations?connected=salesforce`);
    },
  );

  // Disconnect
  app.delete<{ Params: { org_id: string } }>(
    "/api/integrations/salesforce/:org_id",
    async (request, reply) => {
      const { org_id } = request.params;

      const { error } = await supabase
        .from("integrations")
        .delete()
        .eq("org_id", org_id)
        .eq("provider", "salesforce");

      if (error) return reply.status(500).send({ error: error.message });
      return reply.send({ success: true });
    },
  );

  // Manual sync trigger
  app.post<{ Body: { org_id: string } }>(
    "/api/integrations/salesforce/sync",
    async (request, reply) => {
      const { org_id } = request.body;
      if (!org_id) return reply.status(400).send({ error: "org_id required" });

      await crmSyncQueue.add("salesforce-sync", {
        org_id,
        provider: "salesforce",
      });

      return reply.send({ status: "queued" });
    },
  );

  // Get status
  app.get<{ Params: { org_id: string } }>(
    "/api/integrations/salesforce/:org_id/status",
    async (request, reply) => {
      const { org_id } = request.params;

      const { data, error } = await supabase
        .from("integrations")
        .select("status, last_sync, records_synced, sync_errors")
        .eq("org_id", org_id)
        .eq("provider", "salesforce")
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
