-- Fix infinite recursion in organization_users RLS policies
-- Policies previously queried organization_users from within organization_users,
-- which can recurse and surface as PostgREST 500 errors.

-- Security-definer helpers avoid recursive RLS evaluation.
CREATE OR REPLACE FUNCTION private.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id
  FROM public.organization_users
  WHERE user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.is_org_admin_for_org(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = (SELECT auth.uid())
      AND organization_id = target_org_id
      AND role = 'admin'
  );
$$;

-- Keep own-membership read policy as-is.
-- Replace recursive policies with helper-based checks.
DROP POLICY IF EXISTS "users_read_org_members" ON public.organization_users;
CREATE POLICY "users_read_org_members" ON public.organization_users
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT private.user_org_ids())
  );

DROP POLICY IF EXISTS "admins_insert_members" ON public.organization_users;
CREATE POLICY "admins_insert_members" ON public.organization_users
  FOR INSERT TO authenticated
  WITH CHECK (private.is_org_admin_for_org(organization_id));

DROP POLICY IF EXISTS "admins_update_members" ON public.organization_users;
CREATE POLICY "admins_update_members" ON public.organization_users
  FOR UPDATE TO authenticated
  USING (private.is_org_admin_for_org(organization_id));

DROP POLICY IF EXISTS "admins_delete_members" ON public.organization_users;
CREATE POLICY "admins_delete_members" ON public.organization_users
  FOR DELETE TO authenticated
  USING (private.is_org_admin_for_org(organization_id));
