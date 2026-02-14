-- US-009: competitive feature tables — schema + RLS only, no business logic
-- =========================================================================
-- These tables ship in MVP so Phase 2+ UI has tables ready.

-- ── Leaderboards ───────────────────────────────────────────────────────
CREATE TABLE leaderboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  rankings jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leaderboards ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_leaderboards_org_id ON leaderboards USING btree (org_id);

CREATE POLICY "org_members_read_leaderboards" ON leaderboards
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid())));

-- ── Challenges ─────────────────────────────────────────────────────────
CREATE TABLE challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  goal_type text NOT NULL,
  goal_value int NOT NULL,
  scenario_constraints jsonb,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reward text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_challenges_org_id ON challenges USING btree (org_id);

CREATE POLICY "org_members_read_challenges" ON challenges
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid())));

CREATE POLICY "managers_write_challenges" ON challenges
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager'))
  );

-- ── Challenge Entries ──────────────────────────────────────────────────
CREATE TABLE challenge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress int NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE challenge_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_challenge_entries_challenge_id ON challenge_entries USING btree (challenge_id);
CREATE INDEX idx_challenge_entries_user_id ON challenge_entries USING btree (user_id);

CREATE POLICY "users_read_own_entries" ON challenge_entries
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "managers_read_team_entries" ON challenge_entries
  FOR SELECT TO authenticated
  USING (private.is_manager_of(user_id));

CREATE POLICY "users_insert_own_entries" ON challenge_entries
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "users_update_own_entries" ON challenge_entries
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ── Head-to-Head Matches ───────────────────────────────────────────────
CREATE TABLE h2h_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  challenger_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona_seed text NOT NULL,
  scenario_id uuid REFERENCES scenarios(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'challenger_completed', 'opponent_completed', 'scored')),
  deadline timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE h2h_matches ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_h2h_matches_org_id ON h2h_matches USING btree (org_id);
CREATE INDEX idx_h2h_matches_challenger_id ON h2h_matches USING btree (challenger_id);
CREATE INDEX idx_h2h_matches_opponent_id ON h2h_matches USING btree (opponent_id);

-- Participants can read their own matches
CREATE POLICY "participants_read_h2h" ON h2h_matches
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = challenger_id OR (SELECT auth.uid()) = opponent_id
  );

CREATE POLICY "users_insert_h2h" ON h2h_matches
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = challenger_id);

CREATE POLICY "participants_update_h2h" ON h2h_matches
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = challenger_id OR (SELECT auth.uid()) = opponent_id
  );

-- ── Clips ──────────────────────────────────────────────────────────────
CREATE TABLE clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  start_time numeric NOT NULL,
  end_time numeric NOT NULL,
  ai_note text,
  reactions jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clips ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_clips_org_id ON clips USING btree (org_id);
CREATE INDEX idx_clips_user_id ON clips USING btree (user_id);
CREATE INDEX idx_clips_session_id ON clips USING btree (session_id);

CREATE POLICY "org_members_read_clips" ON clips
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid())));

CREATE POLICY "users_insert_clips" ON clips
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "users_update_clips" ON clips
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ── Tournaments ────────────────────────────────────────────────────────
CREATE TABLE tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  format text NOT NULL,
  bracket_json jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tournaments_org_id ON tournaments USING btree (org_id);

CREATE POLICY "org_members_read_tournaments" ON tournaments
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid())));

-- ── Tournament Matches ─────────────────────────────────────────────────
CREATE TABLE tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round int NOT NULL,
  player1_id uuid REFERENCES users(id) ON DELETE SET NULL,
  player2_id uuid REFERENCES users(id) ON DELETE SET NULL,
  winner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tournament_matches_tournament_id ON tournament_matches USING btree (tournament_id);

CREATE POLICY "org_members_read_tournament_matches" ON tournament_matches
  FOR SELECT TO authenticated
  USING (
    tournament_id IN (
      SELECT id FROM tournaments
      WHERE org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid()))
    )
  );
