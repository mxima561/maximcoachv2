-- US-006: organizations, users tables + RLS + security definer functions
-- =======================================================================

-- ── Private schema for security definer functions ──────────────────────
CREATE SCHEMA IF NOT EXISTS private;

-- ── Organizations ──────────────────────────────────────────────────────
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'growth', 'pro')),
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ── Users ──────────────────────────────────────────────────────────────
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'rep' CHECK (role IN ('admin', 'manager', 'rep')),
  name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX idx_users_org_id ON users USING btree (org_id);

-- ── Security Definer Functions ─────────────────────────────────────────

-- Check if current user is a manager of the target user's org
CREATE FUNCTION private.is_manager_of(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
    AND role IN ('manager', 'admin')
    AND org_id = (SELECT org_id FROM public.users WHERE id = target_user_id)
  );
END;
$$;

-- Check if current user is an admin of their org
CREATE FUNCTION private.is_org_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
    AND role = 'admin'
  );
END;
$$;

-- ── RLS Policies: organizations ────────────────────────────────────────

-- Org members can read their org
CREATE POLICY "org_members_read" ON organizations
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid()))
  );

-- Only admins can insert orgs
CREATE POLICY "admins_insert_org" ON organizations
  FOR INSERT TO authenticated
  WITH CHECK (private.is_org_admin() OR NOT EXISTS (
    SELECT 1 FROM users WHERE id = (SELECT auth.uid())
  ));

-- Only admins can update their org
CREATE POLICY "admins_update_org" ON organizations
  FOR UPDATE TO authenticated
  USING (
    id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid()) AND role = 'admin')
  );

-- ── RLS Policies: users ───────────────────────────────────────────────

-- Users can read their own profile + org members
CREATE POLICY "users_read_own_and_org" ON users
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid()))
  );

-- Users can update their own profile
CREATE POLICY "users_update_own" ON users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()));

-- Admins can update any user in their org (role changes)
CREATE POLICY "admins_update_org_users" ON users
  FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid()) AND role = 'admin')
  );

-- Users can insert their own profile (on signup)
CREATE POLICY "users_insert_own" ON users
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

-- ── Trigger: auto-create public.users on auth.users insert ────────────

CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
