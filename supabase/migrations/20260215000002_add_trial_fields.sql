-- Add trial tracking fields to organizations table
-- Update plan constraint to new tier structure
-- =======================================================================

-- ── Add trial tracking columns ─────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN trial_starts_at timestamptz,
  ADD COLUMN trial_ends_at timestamptz,
  ADD COLUMN plan_updated_at timestamptz;

-- ── Update plan constraint to new tiers ────────────────────────────────
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('trial', 'starter', 'growth', 'scale', 'enterprise', 'free'));

-- ── Create index for efficient trial queries ───────────────────────────
CREATE INDEX idx_organizations_trial_ends_at ON organizations(trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;

-- ── Migrate existing plan values to new structure ──────────────────────
-- Update old 'pro' plan to 'scale'
UPDATE organizations SET plan = 'scale' WHERE plan = 'pro';

-- 'growth' stays as 'growth' (already matches new tier)
-- 'free' stays as 'free' (already matches new tier)
