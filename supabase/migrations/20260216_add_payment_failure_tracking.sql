-- Add payment failure tracking for grace period handling
-- Enables 7-day grace period before downgrading on payment failures
-- =======================================================================

-- ── Add payment failure timestamp ──────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN payment_failed_at timestamptz,
  ADD COLUMN payment_failure_count int DEFAULT 0;

-- ── Add index for grace period queries ─────────────────────────────────
CREATE INDEX idx_organizations_payment_failed
  ON organizations(payment_failed_at)
  WHERE payment_failed_at IS NOT NULL;

-- ── Add comments ───────────────────────────────────────────────────────
COMMENT ON COLUMN organizations.payment_failed_at IS 'When payment first failed (for 7-day grace period)';
COMMENT ON COLUMN organizations.payment_failure_count IS 'Number of consecutive payment failures';
