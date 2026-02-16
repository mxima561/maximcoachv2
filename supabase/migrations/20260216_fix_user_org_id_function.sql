-- Update private.user_org_id to use organization_users
-- Ensures RLS policies work after org_id was removed from users
-- =======================================================================

CREATE OR REPLACE FUNCTION private.user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id
  FROM public.organization_users
  WHERE user_id = (SELECT auth.uid())
  ORDER BY created_at ASC
  LIMIT 1;
$$;
