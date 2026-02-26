-- US-007: Add session_type to sessions + coaching_insights table
-- ================================================================

-- ── Add session_type to sessions ───────────────────────────────────────
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'simulation'
  CHECK (session_type IN ('simulation', 'live_coaching'));

CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions USING btree (session_type);

-- ── coaching_insights table ────────────────────────────────────────────
CREATE TABLE coaching_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sentiment_timeline jsonb DEFAULT '[]',
  talk_ratio float CHECK (talk_ratio >= 0 AND talk_ratio <= 1),
  topics_covered text[] DEFAULT '{}',
  topics_missed text[] DEFAULT '{}',
  suggestions_surfaced integer DEFAULT 0,
  battle_cards_triggered integer DEFAULT 0,
  overall_sentiment text CHECK (overall_sentiment IN ('positive', 'neutral', 'negative')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coaching_insights ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_coaching_insights_session_id ON coaching_insights USING btree (session_id);
CREATE INDEX idx_coaching_insights_org_id ON coaching_insights USING btree (org_id);

-- ── RLS Policies: coaching_insights (same pattern as scorecards) ───────

-- Users see insights for their own sessions
CREATE POLICY "users_read_own_coaching_insights" ON coaching_insights
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = (SELECT auth.uid())));

-- Managers see insights for team sessions
CREATE POLICY "managers_read_team_coaching_insights" ON coaching_insights
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM sessions WHERE private.is_manager_of(user_id)));

-- Users insert insights for their own sessions
CREATE POLICY "users_insert_coaching_insights" ON coaching_insights
  FOR INSERT TO authenticated
  WITH CHECK (session_id IN (SELECT id FROM sessions WHERE user_id = (SELECT auth.uid())));

-- Admins see all insights in their org
CREATE POLICY "admins_read_org_coaching_insights" ON coaching_insights
  FOR SELECT TO authenticated
  USING (org_id = private.user_org_id() AND private.is_org_admin());
