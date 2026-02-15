-- Create organization_users junction table
-- Allows users to belong to multiple organizations
-- =======================================================================

-- ── Create junction table ──────────────────────────────────────────────
CREATE TABLE organization_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'rep' CHECK (role IN ('admin', 'manager', 'rep')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- ── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX idx_organization_users_org_id ON organization_users(organization_id);
CREATE INDEX idx_organization_users_user_id ON organization_users(user_id);

-- ── Enable RLS ─────────────────────────────────────────────────────────
ALTER TABLE organization_users ENABLE ROW LEVEL SECURITY;

-- ── Migrate existing users.org_id relationships ────────────────────────
INSERT INTO organization_users (organization_id, user_id, role)
SELECT org_id, id, role
FROM users
WHERE org_id IS NOT NULL;

-- ── Drop old org_id and role columns from users ────────────────────────
ALTER TABLE users DROP COLUMN org_id;
ALTER TABLE users DROP COLUMN role;

-- ── RLS Policies: organization_users ───────────────────────────────────

-- Users can read their own org memberships
CREATE POLICY "users_read_own_memberships" ON organization_users
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Users can read other members of their orgs
CREATE POLICY "users_read_org_members" ON organization_users
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = (SELECT auth.uid())
    )
  );

-- Admins can insert new members to their orgs
CREATE POLICY "admins_insert_members" ON organization_users
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
    )
  );

-- Admins can update members in their orgs
CREATE POLICY "admins_update_members" ON organization_users
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
    )
  );

-- Admins can delete members from their orgs
CREATE POLICY "admins_delete_members" ON organization_users
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
    )
  );

-- ── Update security definer functions ──────────────────────────────────

-- Drop old functions that reference users.org_id
DROP FUNCTION IF EXISTS private.is_manager_of(uuid);
DROP FUNCTION IF EXISTS private.is_org_admin();

-- Recreate with organization_users reference
CREATE FUNCTION private.is_manager_of(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_users ou1
    JOIN public.organization_users ou2 ON ou1.organization_id = ou2.organization_id
    WHERE ou1.user_id = (SELECT auth.uid())
    AND ou1.role IN ('manager', 'admin')
    AND ou2.user_id = target_user_id
  );
END;
$$;

CREATE FUNCTION private.is_org_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE user_id = (SELECT auth.uid())
    AND role = 'admin'
  );
END;
$$;

-- ── Update RLS policies that referenced users.org_id ───────────────────

-- Drop old users policies
DROP POLICY IF EXISTS "users_read_own_and_org" ON users;
DROP POLICY IF EXISTS "admins_update_org_users" ON users;

-- Recreate users policies
CREATE POLICY "users_read_own_and_org" ON users
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR id IN (
      SELECT ou2.user_id FROM organization_users ou1
      JOIN organization_users ou2 ON ou1.organization_id = ou2.organization_id
      WHERE ou1.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "admins_update_org_users" ON users
  FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT ou2.user_id FROM organization_users ou1
      JOIN organization_users ou2 ON ou1.organization_id = ou2.organization_id
      WHERE ou1.user_id = (SELECT auth.uid()) AND ou1.role = 'admin'
    )
  );

-- Drop old organizations policies
DROP POLICY IF EXISTS "org_members_read" ON organizations;
DROP POLICY IF EXISTS "admins_update_org" ON organizations;

-- Recreate organizations policies
CREATE POLICY "org_members_read" ON organizations
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT organization_id FROM organization_users WHERE user_id = (SELECT auth.uid()))
  );

CREATE POLICY "admins_update_org" ON organizations
  FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
    )
  );
