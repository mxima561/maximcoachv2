#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STAGING_FIXTURE_USER_ID"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const startsAt = new Date();
const endsAt = new Date(startsAt);
endsAt.setDate(endsAt.getDate() + 14);

const orgName = `qa-staging-${startsAt.toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
const { data: org, error: orgError } = await supabase
  .from("organizations")
  .insert({
    name: orgName,
    plan: "trial",
    trial_starts_at: startsAt.toISOString(),
    trial_ends_at: endsAt.toISOString(),
    plan_updated_at: startsAt.toISOString(),
  })
  .select("id,name")
  .single();

if (orgError || !org) {
  console.error("Failed to seed organization", orgError);
  process.exit(1);
}

const { error: memberError } = await supabase
  .from("organization_users")
  .insert({
    organization_id: org.id,
    user_id: process.env.STAGING_FIXTURE_USER_ID,
    role: "admin",
  });

if (memberError) {
  console.error("Failed to seed organization membership", memberError);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      seededAt: startsAt.toISOString(),
      org_id: org.id,
      org_name: org.name,
      user_id: process.env.STAGING_FIXTURE_USER_ID,
    },
    null,
    2,
  ),
);
