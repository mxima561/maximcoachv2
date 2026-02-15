-- Create trial_sessions table for IP-based tracking
-- Enforces global 5-session limit per IP address
-- =======================================================================

-- ── Create trial_sessions table ────────────────────────────────────────
CREATE TABLE trial_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ip_address inet NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Create indexes for fast IP-based counting ──────────────────────────
CREATE INDEX idx_trial_sessions_ip ON trial_sessions(ip_address);
CREATE INDEX idx_trial_sessions_org ON trial_sessions(organization_id);
CREATE INDEX idx_trial_sessions_created ON trial_sessions(created_at);

-- ── Enable RLS ─────────────────────────────────────────────────────────
ALTER TABLE trial_sessions ENABLE ROW LEVEL SECURITY;

-- ── RLS policies ───────────────────────────────────────────────────────

-- Service role has full access (for API routes)
CREATE POLICY "Service role full access" ON trial_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Org admins can read their org's trial sessions
CREATE POLICY "Admins read org sessions" ON trial_sessions
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
    )
  );
