-- Create trial_events table for conversion analytics
-- Tracks conversion funnel: trial_started -> first_session -> upgraded
-- =======================================================================

-- ── Create trial_events table ──────────────────────────────────────────
CREATE TABLE trial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'trial_started',
      'first_session',
      'session_limit_hit',
      'trial_expired',
      'upgraded',
      'upgrade_clicked'
    )
  ),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Create indexes for analytics queries ───────────────────────────────
CREATE INDEX idx_trial_events_org ON trial_events(organization_id);
CREATE INDEX idx_trial_events_type ON trial_events(event_type);
CREATE INDEX idx_trial_events_created ON trial_events(created_at);
CREATE INDEX idx_trial_events_org_type ON trial_events(organization_id, event_type);

-- ── Enable RLS ─────────────────────────────────────────────────────────
ALTER TABLE trial_events ENABLE ROW LEVEL SECURITY;

-- ── RLS policies ───────────────────────────────────────────────────────

-- Service role has full access (for API routes and analytics)
CREATE POLICY "Service role full access" ON trial_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Org admins can read their org's trial events
CREATE POLICY "Admins read org events" ON trial_events
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
    )
  );
