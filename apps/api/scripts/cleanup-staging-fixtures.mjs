#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STAGING_FIXTURE_ORG_ID"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const orgId = process.env.STAGING_FIXTURE_ORG_ID;
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

await supabase.from("trial_sessions").delete().eq("organization_id", orgId);
await supabase.from("trial_events").delete().eq("organization_id", orgId);
await supabase.from("organization_users").delete().eq("organization_id", orgId);
await supabase.from("organizations").delete().eq("id", orgId);

console.log(JSON.stringify({ cleanedOrgId: orgId, cleanedAt: new Date().toISOString() }, null, 2));
