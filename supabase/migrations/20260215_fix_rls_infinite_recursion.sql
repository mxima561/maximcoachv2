-- Fix infinite recursion in RLS policies
-- The original policies on `users` referenced `users` in subqueries,
-- which triggered RLS again, causing infinite recursion.
-- Solution: Use a SECURITY DEFINER function to bypass RLS when looking up the current user's org_id.

-- Step 1: Create SECURITY DEFINER function to get user's org_id without triggering RLS
CREATE OR REPLACE FUNCTION private.user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT org_id FROM public.users WHERE id = (SELECT auth.uid()) LIMIT 1;
$$;

-- Step 2: Fix users table policy (was self-referencing)
DROP POLICY IF EXISTS "users_read_own_and_org" ON public.users;
CREATE POLICY "users_read_own_and_org" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR org_id = private.user_org_id()
  );

DROP POLICY IF EXISTS "admins_update_org_users" ON public.users;
CREATE POLICY "admins_update_org_users" ON public.users
  FOR UPDATE TO authenticated
  USING (org_id = private.user_org_id() AND private.is_org_admin());

-- Step 3: Fix all other tables that subqueried users for org_id

-- organizations
DROP POLICY IF EXISTS "org_members_read" ON public.organizations;
CREATE POLICY "org_members_read" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = private.user_org_id());

DROP POLICY IF EXISTS "admins_update_org" ON public.organizations;
CREATE POLICY "admins_update_org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (id = private.user_org_id() AND private.is_org_admin());

-- leads
DROP POLICY IF EXISTS "org_members_read_leads" ON public.leads;
CREATE POLICY "org_members_read_leads" ON public.leads
  FOR SELECT TO authenticated
  USING (org_id = private.user_org_id());

DROP POLICY IF EXISTS "org_members_update_leads" ON public.leads;
CREATE POLICY "org_members_update_leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (org_id = private.user_org_id());

DROP POLICY IF EXISTS "org_members_delete_leads" ON public.leads;
CREATE POLICY "org_members_delete_leads" ON public.leads
  FOR DELETE TO authenticated
  USING (org_id = private.user_org_id());

-- personas
DROP POLICY IF EXISTS "org_members_read_personas" ON public.personas;
CREATE POLICY "org_members_read_personas" ON public.personas
  FOR SELECT TO authenticated
  USING (org_id = private.user_org_id());

-- scenarios
DROP POLICY IF EXISTS "org_members_read_scenarios" ON public.scenarios;
CREATE POLICY "org_members_read_scenarios" ON public.scenarios
  FOR SELECT TO authenticated
  USING (org_id = private.user_org_id());

DROP POLICY IF EXISTS "managers_update_scenarios" ON public.scenarios;
CREATE POLICY "managers_update_scenarios" ON public.scenarios
  FOR UPDATE TO authenticated
  USING (org_id = private.user_org_id());

-- challenges
DROP POLICY IF EXISTS "org_members_read_challenges" ON public.challenges;
CREATE POLICY "org_members_read_challenges" ON public.challenges
  FOR SELECT TO authenticated
  USING (org_id = private.user_org_id());

-- clips
DROP POLICY IF EXISTS "org_members_read_clips" ON public.clips;
CREATE POLICY "org_members_read_clips" ON public.clips
  FOR SELECT TO authenticated
  USING (org_id = private.user_org_id());

-- embeddings
DROP POLICY IF EXISTS "org_members_read_embeddings" ON public.embeddings;
CREATE POLICY "org_members_read_embeddings" ON public.embeddings
  FOR SELECT TO authenticated
  USING (org_id = private.user_org_id());

-- integrations
DROP POLICY IF EXISTS "admins_read_integrations" ON public.integrations;
CREATE POLICY "admins_read_integrations" ON public.integrations
  FOR SELECT TO authenticated
  USING (org_id = private.user_org_id() AND private.is_org_admin());

DROP POLICY IF EXISTS "admins_update_integrations" ON public.integrations;
CREATE POLICY "admins_update_integrations" ON public.integrations
  FOR UPDATE TO authenticated
  USING (org_id = private.user_org_id() AND private.is_org_admin());

DROP POLICY IF EXISTS "admins_delete_integrations" ON public.integrations;
CREATE POLICY "admins_delete_integrations" ON public.integrations
  FOR DELETE TO authenticated
  USING (org_id = private.user_org_id() AND private.is_org_admin());

-- leaderboards
DROP POLICY IF EXISTS "org_members_read_leaderboards" ON public.leaderboards;
CREATE POLICY "org_members_read_leaderboards" ON public.leaderboards
  FOR SELECT TO authenticated
  USING (org_id = private.user_org_id());

-- tournaments
DROP POLICY IF EXISTS "org_members_read_tournaments" ON public.tournaments;
CREATE POLICY "org_members_read_tournaments" ON public.tournaments
  FOR SELECT TO authenticated
  USING (org_id = private.user_org_id());

-- tournament_matches
DROP POLICY IF EXISTS "org_members_read_tournament_matches" ON public.tournament_matches;
CREATE POLICY "org_members_read_tournament_matches" ON public.tournament_matches
  FOR SELECT TO authenticated
  USING (tournament_id IN (
    SELECT id FROM public.tournaments WHERE org_id = private.user_org_id()
  ));
