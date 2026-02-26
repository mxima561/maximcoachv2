-- pgTAP tests for RLS policies
-- Run with: supabase test db
--
-- Test fixtures: 2 orgs, each with admin + manager + rep.
-- Verifies that RLS policies correctly isolate data by org and role.

BEGIN;
SELECT plan(24);

-- ── Fixtures ───────────────────────────────────────────────────────────

-- Create test organizations (bypass RLS with service role)
INSERT INTO organizations (id, name, plan)
VALUES
  ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'Org Alpha', 'growth'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'Org Beta',  'growth');

-- Create auth users (Supabase auth.users)
INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role)
VALUES
  -- Org Alpha users
  ('11111111-1111-4111-b111-111111111111', 'admin-a@test.com',   '{"full_name":"Admin A"}'::jsonb,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-b222-222222222222', 'manager-a@test.com', '{"full_name":"Manager A"}'::jsonb, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-b333-333333333333', 'rep-a@test.com',     '{"full_name":"Rep A"}'::jsonb,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  -- Org Beta users
  ('44444444-4444-4444-b444-444444444444', 'admin-b@test.com',   '{"full_name":"Admin B"}'::jsonb,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('55555555-5555-4555-b555-555555555555', 'manager-b@test.com', '{"full_name":"Manager B"}'::jsonb, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('66666666-6666-4666-b666-666666666666', 'rep-b@test.com',     '{"full_name":"Rep B"}'::jsonb,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- Set org_id and role on public.users (trigger created the rows)
UPDATE users SET org_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', role = 'admin'   WHERE id = '11111111-1111-4111-b111-111111111111';
UPDATE users SET org_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', role = 'manager' WHERE id = '22222222-2222-4222-b222-222222222222';
UPDATE users SET org_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', role = 'rep'     WHERE id = '33333333-3333-4333-b333-333333333333';
UPDATE users SET org_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', role = 'admin'   WHERE id = '44444444-4444-4444-b444-444444444444';
UPDATE users SET org_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', role = 'manager' WHERE id = '55555555-5555-4555-b555-555555555555';
UPDATE users SET org_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', role = 'rep'     WHERE id = '66666666-6666-4666-b666-666666666666';

-- Create leads for each org
INSERT INTO leads (id, org_id, name, company)
VALUES
  ('aaa11111-0000-4000-a000-000000000001', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'Lead Alpha', 'AlphaCo'),
  ('bbb11111-0000-4000-a000-000000000001', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'Lead Beta', 'BetaCo');

-- Create personas
INSERT INTO personas (id, lead_id, org_id, persona_json, difficulty_level)
VALUES
  ('aaa22222-0000-4000-a000-000000000001', 'aaa11111-0000-4000-a000-000000000001', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', '{"name":"VP Sales"}'::jsonb, 5),
  ('bbb22222-0000-4000-a000-000000000001', 'bbb11111-0000-4000-a000-000000000001', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', '{"name":"CTO"}'::jsonb, 7);

-- Create sessions for rep-a and rep-b
INSERT INTO sessions (id, user_id, org_id, persona_id, scenario_type, status)
VALUES
  ('aaa33333-0000-4000-a000-000000000001', '33333333-3333-4333-b333-333333333333', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'aaa22222-0000-4000-a000-000000000001', 'cold_call', 'completed'),
  ('bbb33333-0000-4000-a000-000000000001', '66666666-6666-4666-b666-666666666666', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'bbb22222-0000-4000-a000-000000000001', 'discovery', 'completed');

-- Create transcripts
INSERT INTO transcripts (id, session_id, messages)
VALUES
  ('aaa44444-0000-4000-a000-000000000001', 'aaa33333-0000-4000-a000-000000000001', '[{"role":"user","content":"Hello"}]'::jsonb),
  ('bbb44444-0000-4000-a000-000000000001', 'bbb33333-0000-4000-a000-000000000001', '[{"role":"user","content":"Hi there"}]'::jsonb);

-- Create integrations (admin-only access)
INSERT INTO integrations (id, org_id, provider, access_token_encrypted)
VALUES
  ('aaa55555-0000-4000-a000-000000000001', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'salesforce', 'enc_token_alpha'),
  ('bbb55555-0000-4000-a000-000000000001', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'hubspot', 'enc_token_beta');


-- ── Test 1: Rep can SELECT own sessions ────────────────────────────────
SET LOCAL request.jwt.claims TO '{"sub": "33333333-3333-4333-b333-333333333333", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM sessions),
  1,
  'Rep A sees exactly 1 session (their own)'
);

SELECT is(
  (SELECT user_id::text FROM sessions LIMIT 1),
  '33333333-3333-4333-b333-333333333333',
  'Rep A sees their own session'
);

RESET ROLE;

-- ── Test 2: Rep cannot see other users sessions (even same org) ────────
-- Create a session for manager-a in Org Alpha
INSERT INTO sessions (id, user_id, org_id, scenario_type, status)
VALUES ('aaa33333-0000-4000-a000-000000000002', '22222222-2222-4222-b222-222222222222', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'discovery', 'completed');

SET LOCAL request.jwt.claims TO '{"sub": "33333333-3333-4333-b333-333333333333", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM sessions),
  1,
  'Rep A still sees only 1 session (not manager-a session)'
);

RESET ROLE;

-- ── Test 3: Rep cannot see sessions from different org ─────────────────
SET LOCAL request.jwt.claims TO '{"sub": "33333333-3333-4333-b333-333333333333", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM sessions WHERE org_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'),
  0,
  'Rep A sees 0 sessions from Org Beta'
);

RESET ROLE;

-- ── Test 4: Manager can see sessions of users in their org ─────────────
SET LOCAL request.jwt.claims TO '{"sub": "22222222-2222-4222-b222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT ok(
  (SELECT count(*)::int FROM sessions) >= 2,
  'Manager A can see at least 2 sessions in their org (rep-a + their own)'
);

RESET ROLE;

-- ── Test 5: Manager cannot see sessions from different org ─────────────
SET LOCAL request.jwt.claims TO '{"sub": "22222222-2222-4222-b222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM sessions WHERE user_id = '66666666-6666-4666-b666-666666666666'),
  0,
  'Manager A sees 0 sessions from Org Beta rep'
);

RESET ROLE;

-- ── Test 6: Admin can see integrations for their org ───────────────────
SET LOCAL request.jwt.claims TO '{"sub": "11111111-1111-4111-b111-111111111111", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM integrations),
  1,
  'Admin A sees exactly 1 integration (their org)'
);

RESET ROLE;

-- ── Test 7: Non-admin cannot see integrations ──────────────────────────
SET LOCAL request.jwt.claims TO '{"sub": "33333333-3333-4333-b333-333333333333", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM integrations),
  0,
  'Rep A sees 0 integrations (admin-only)'
);

RESET ROLE;

-- ── Test 8: Admin cannot see integrations from other org ───────────────
SET LOCAL request.jwt.claims TO '{"sub": "11111111-1111-4111-b111-111111111111", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM integrations WHERE org_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'),
  0,
  'Admin A cannot see Org Beta integrations'
);

RESET ROLE;

-- ── Test 9: Org members can read leads in their org ────────────────────
SET LOCAL request.jwt.claims TO '{"sub": "33333333-3333-4333-b333-333333333333", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM leads),
  1,
  'Rep A sees exactly 1 lead (their org)'
);

RESET ROLE;

-- ── Test 10: Users cannot read leads from other org ────────────────────
SET LOCAL request.jwt.claims TO '{"sub": "33333333-3333-4333-b333-333333333333", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM leads WHERE org_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'),
  0,
  'Rep A sees 0 leads from Org Beta'
);

RESET ROLE;

-- ── Test 11: Users cannot read personas from other org ─────────────────
SET LOCAL request.jwt.claims TO '{"sub": "66666666-6666-4666-b666-666666666666", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM personas WHERE org_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  0,
  'Rep B sees 0 personas from Org Alpha'
);

RESET ROLE;

-- ── Test 12: Users cannot read transcripts from other org ──────────────
SET LOCAL request.jwt.claims TO '{"sub": "66666666-6666-4666-b666-666666666666", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM transcripts),
  1,
  'Rep B sees exactly 1 transcript (their own session)'
);

RESET ROLE;

-- ── Test 13: Manager sees personas in their org ────────────────────────
SET LOCAL request.jwt.claims TO '{"sub": "55555555-5555-4555-b555-555555555555", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM personas),
  1,
  'Manager B sees exactly 1 persona (their org)'
);

RESET ROLE;

-- ── Test 14: Admin can INSERT scenarios for their org ──────────────────
SET LOCAL request.jwt.claims TO '{"sub": "11111111-1111-4111-b111-111111111111", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$INSERT INTO scenarios (org_id, name, type) VALUES ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'Test Scenario', 'cold_call')$$,
  'Admin A can insert scenarios for their org'
);

RESET ROLE;

-- ── Test 15: Admin can UPDATE scenarios for their org ──────────────────
SET LOCAL request.jwt.claims TO '{"sub": "11111111-1111-4111-b111-111111111111", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$UPDATE scenarios SET name = 'Updated Scenario' WHERE org_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'$$,
  'Admin A can update scenarios in their org'
);

RESET ROLE;

-- ── Test 16: Admin can INSERT integrations for their org ───────────────
SET LOCAL request.jwt.claims TO '{"sub": "11111111-1111-4111-b111-111111111111", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$INSERT INTO integrations (org_id, provider, access_token_encrypted) VALUES ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'hubspot', 'enc_new_token')$$,
  'Admin A can insert integrations for their org'
);

RESET ROLE;

-- ── Test 17: Admin can UPDATE integrations for their org ───────────────
SET LOCAL request.jwt.claims TO '{"sub": "11111111-1111-4111-b111-111111111111", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$UPDATE integrations SET last_sync = now() WHERE org_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'$$,
  'Admin A can update integrations in their org'
);

RESET ROLE;

-- ── Test 18: Org members read their own org only ───────────────────────
SET LOCAL request.jwt.claims TO '{"sub": "33333333-3333-4333-b333-333333333333", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM organizations),
  1,
  'Rep A sees exactly 1 organization (their own)'
);

RESET ROLE;

-- ── Test 19: Users cannot see other org's organizations row ────────────
SET LOCAL request.jwt.claims TO '{"sub": "33333333-3333-4333-b333-333333333333", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM organizations WHERE id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'),
  0,
  'Rep A cannot see Org Beta organization row'
);

RESET ROLE;

-- ── Test 20: Rep from Org Beta is fully isolated from Org Alpha data ───
SET LOCAL request.jwt.claims TO '{"sub": "66666666-6666-4666-b666-666666666666", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM leads WHERE org_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
  + (SELECT count(*)::int FROM personas WHERE org_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
  + (SELECT count(*)::int FROM sessions WHERE org_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  0,
  'Rep B sees 0 leads + 0 personas + 0 sessions from Org Alpha (full isolation)'
);

RESET ROLE;

-- ── Test 21: coaching_insights — user sees own session insights ────────
INSERT INTO coaching_insights (id, session_id, org_id, overall_sentiment, talk_ratio)
VALUES
  ('aaa66666-0000-4000-a000-000000000001', 'aaa33333-0000-4000-a000-000000000001', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'positive', 0.45),
  ('bbb66666-0000-4000-a000-000000000001', 'bbb33333-0000-4000-a000-000000000001', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'neutral', 0.60);

SET LOCAL request.jwt.claims TO '{"sub": "33333333-3333-4333-b333-333333333333", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM coaching_insights),
  1,
  'Rep A sees 1 coaching_insight (their own session)'
);

RESET ROLE;

-- ── Test 22: coaching_insights — user cannot see other org insights ────
SET LOCAL request.jwt.claims TO '{"sub": "33333333-3333-4333-b333-333333333333", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM coaching_insights WHERE org_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'),
  0,
  'Rep A sees 0 coaching_insights from Org Beta'
);

RESET ROLE;

-- ── Test 23: coaching_insights — manager sees team insights ────────────
SET LOCAL request.jwt.claims TO '{"sub": "22222222-2222-4222-b222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT ok(
  (SELECT count(*)::int FROM coaching_insights) >= 1,
  'Manager A can see coaching_insights for team sessions'
);

RESET ROLE;

-- ── Test 24: coaching_insights — admin sees all org insights ───────────
SET LOCAL request.jwt.claims TO '{"sub": "11111111-1111-4111-b111-111111111111", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

SELECT ok(
  (SELECT count(*)::int FROM coaching_insights) >= 1,
  'Admin A can see coaching_insights in their org'
);

RESET ROLE;

-- ── Cleanup ────────────────────────────────────────────────────────────
SELECT * FROM finish();
ROLLBACK;
