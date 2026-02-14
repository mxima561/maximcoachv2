-- US-007: leads, personas, sessions, transcripts, scorecards, scenarios, integrations
-- ==================================================================================

-- ── Leads ──────────────────────────────────────────────────────────────
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  company text NOT NULL,
  title text,
  industry text,
  crm_source text NOT NULL DEFAULT 'manual' CHECK (crm_source IN ('google_sheets', 'salesforce', 'hubspot', 'manual')),
  data_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_leads_org_id ON leads USING btree (org_id);

CREATE POLICY "org_members_read_leads" ON leads
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid())));

CREATE POLICY "org_members_insert_leads" ON leads
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid())));

CREATE POLICY "org_members_update_leads" ON leads
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid())));

CREATE POLICY "org_members_delete_leads" ON leads
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid())));

-- ── Personas ───────────────────────────────────────────────────────────
CREATE TABLE personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  persona_json jsonb NOT NULL DEFAULT '{}',
  difficulty_level int NOT NULL DEFAULT 5 CHECK (difficulty_level BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_personas_org_id ON personas USING btree (org_id);
CREATE INDEX idx_personas_lead_id ON personas USING btree (lead_id);

CREATE POLICY "org_members_read_personas" ON personas
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid())));

-- ── Scenarios ──────────────────────────────────────────────────────────
CREATE TABLE scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('cold_call', 'discovery', 'objection_handling', 'closing')),
  industry text,
  config_json jsonb,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_scenarios_org_id ON scenarios USING btree (org_id);

CREATE POLICY "org_members_read_scenarios" ON scenarios
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid())));

CREATE POLICY "managers_write_scenarios" ON scenarios
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users
      WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "managers_update_scenarios" ON scenarios
  FOR UPDATE TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
    )
  );

-- ── Sessions ───────────────────────────────────────────────────────────
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  persona_id uuid REFERENCES personas(id) ON DELETE SET NULL,
  scenario_type text NOT NULL CHECK (scenario_type IN ('cold_call', 'discovery', 'objection_handling', 'closing')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  tokens_used int,
  audio_seconds_stt numeric,
  audio_seconds_tts numeric,
  cost_usd numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sessions_user_id ON sessions USING btree (user_id);
CREATE INDEX idx_sessions_org_id ON sessions USING btree (org_id);

-- Reps see their own sessions
CREATE POLICY "reps_own_sessions" ON sessions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Managers see team sessions
CREATE POLICY "managers_team_sessions" ON sessions
  FOR SELECT TO authenticated
  USING (private.is_manager_of(user_id));

-- Users insert their own sessions
CREATE POLICY "users_insert_sessions" ON sessions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Users update their own sessions
CREATE POLICY "users_update_sessions" ON sessions
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ── Transcripts ────────────────────────────────────────────────────────
CREATE TABLE transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  messages jsonb NOT NULL DEFAULT '[]',
  word_timestamps jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_transcripts_session_id ON transcripts USING btree (session_id);

-- Access follows session RLS via join
CREATE POLICY "users_read_own_transcripts" ON transcripts
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "managers_read_team_transcripts" ON transcripts
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM sessions WHERE private.is_manager_of(user_id)));

CREATE POLICY "users_insert_transcripts" ON transcripts
  FOR INSERT TO authenticated
  WITH CHECK (session_id IN (SELECT id FROM sessions WHERE user_id = (SELECT auth.uid())));

-- ── Scorecards ─────────────────────────────────────────────────────────
CREATE TABLE scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scores jsonb NOT NULL DEFAULT '{}',
  overall_score int NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  coaching_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scorecards ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_scorecards_session_id ON scorecards USING btree (session_id);
CREATE INDEX idx_scorecards_user_id ON scorecards USING btree (user_id);
CREATE INDEX idx_scorecards_org_id ON scorecards USING btree (org_id);

CREATE POLICY "reps_own_scorecards" ON scorecards
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "managers_team_scorecards" ON scorecards
  FOR SELECT TO authenticated
  USING (private.is_manager_of(user_id));

CREATE POLICY "users_insert_scorecards" ON scorecards
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── Integrations ───────────────────────────────────────────────────────
CREATE TABLE integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('salesforce', 'hubspot', 'google_sheets')),
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  last_sync timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_integrations_org_id ON integrations USING btree (org_id);

-- Admin-only access
CREATE POLICY "admins_read_integrations" ON integrations
  FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid()) AND role = 'admin')
  );

CREATE POLICY "admins_write_integrations" ON integrations
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid()) AND role = 'admin')
  );

CREATE POLICY "admins_update_integrations" ON integrations
  FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid()) AND role = 'admin')
  );

CREATE POLICY "admins_delete_integrations" ON integrations
  FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid()) AND role = 'admin')
  );
