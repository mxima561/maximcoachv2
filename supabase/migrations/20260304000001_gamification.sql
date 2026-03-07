-- Gamification system: XP, Streaks, Ranks, Badges
-- ================================================

-- ── Rank definitions ─────────────────────────────────────────
-- Stored as a reference table so thresholds can be tuned without code changes.

CREATE TABLE ranks (
  level int PRIMARY KEY,
  name text NOT NULL UNIQUE,
  min_xp int NOT NULL,
  icon text NOT NULL DEFAULT '🔰'
);

INSERT INTO ranks (level, name, min_xp, icon) VALUES
  (1,  'Rookie',       0,       '🔰'),
  (2,  'Prospect',     500,     '🌱'),
  (3,  'Closer',       2000,    '🎯'),
  (4,  'Dealmaker',    5000,    '🤝'),
  (5,  'Rainmaker',    10000,   '🌧️'),
  (6,  'Sales Ace',    20000,   '♠️'),
  (7,  'Revenue King', 40000,   '👑'),
  (8,  'Legend',       75000,   '🏆'),
  (9,  'Grandmaster',  120000,  '💎'),
  (10, 'Titan',        200000,  '⚡');

-- ── Extend users table ───────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS total_xp int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_practice_date date,
  ADD COLUMN IF NOT EXISTS rank_level int NOT NULL DEFAULT 1 REFERENCES ranks(level),
  ADD COLUMN IF NOT EXISTS daily_goal_minutes int NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/New_York';

CREATE INDEX IF NOT EXISTS idx_users_rank ON users (rank_level);
CREATE INDEX IF NOT EXISTS idx_users_total_xp ON users (total_xp DESC);

-- ── XP events ────────────────────────────────────────────────

CREATE TABLE xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'session_complete', 'drill_complete', 'badge_earned',
    'streak_bonus', 'h2h_win', 'challenge_complete',
    'first_session_of_day', 'perfect_score'
  )),
  xp_amount int NOT NULL CHECK (xp_amount > 0),
  source_id uuid,
  source_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_xp_events_user ON xp_events (user_id, created_at DESC);
CREATE INDEX idx_xp_events_org ON xp_events (org_id);

-- ── Badges ───────────────────────────────────────────────────

CREATE TABLE badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT '🏅',
  category text NOT NULL CHECK (category IN (
    'milestone', 'streak', 'skill', 'social', 'special'
  )),
  criteria_type text NOT NULL,
  criteria_value int NOT NULL,
  xp_reward int NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

CREATE INDEX idx_user_badges_user ON user_badges (user_id);

-- ── Seed badges ──────────────────────────────────────────────

INSERT INTO badges (slug, name, description, icon, category, criteria_type, criteria_value, xp_reward) VALUES
  -- Milestone badges
  ('first_session',     'First Steps',       'Complete your first training session',      '👣', 'milestone', 'total_sessions',    1,   100),
  ('sessions_10',       'Getting Warmed Up',  'Complete 10 training sessions',            '🔥', 'milestone', 'total_sessions',    10,  200),
  ('sessions_50',       'Practice Pro',       'Complete 50 training sessions',            '💪', 'milestone', 'total_sessions',    50,  500),
  ('sessions_100',      'Century Club',       'Complete 100 training sessions',           '💯', 'milestone', 'total_sessions',    100, 1000),
  -- Streak badges
  ('streak_3',          'On a Roll',          'Maintain a 3-day practice streak',         '🔥', 'streak',    'streak_days',       3,   150),
  ('streak_7',          'Weekly Warrior',     'Maintain a 7-day practice streak',         '⚔️', 'streak',    'streak_days',       7,   300),
  ('streak_14',         'Unstoppable',        'Maintain a 14-day practice streak',        '🚀', 'streak',    'streak_days',       14,  500),
  ('streak_30',         'Monthly Master',     'Maintain a 30-day practice streak',        '🌟', 'streak',    'streak_days',       30,  1000),
  -- Skill badges
  ('score_80',          'Skilled Seller',     'Score 80+ on a session',                   '🎯', 'skill',     'best_score',        80,  200),
  ('score_90',          'Top Performer',      'Score 90+ on a session',                   '⭐', 'skill',     'best_score',        90,  500),
  ('score_100',         'Perfect Pitch',      'Score 100 on a session',                   '💎', 'skill',     'best_score',        100, 1000),
  ('all_scenarios',     'Versatile',          'Complete every scenario type',              '🎭', 'skill',     'unique_scenarios',  4,   300),
  -- Social badges
  ('first_h2h_win',     'Competitor',         'Win your first head-to-head match',        '🥊', 'social',    'h2h_wins',          1,   200),
  ('h2h_wins_10',       'Champion',           'Win 10 head-to-head matches',              '🏆', 'social',    'h2h_wins',          10,  500),
  ('challenge_complete', 'Team Player',       'Complete your first team challenge',        '🤝', 'social',    'challenges_done',   1,   200),
  -- Special
  ('early_bird',        'Early Adopter',      'Join MaximaCoach in its first month',      '🐣', 'special',   'special',           1,   500),
  ('comeback_kid',      'Comeback Kid',       'Resume after 7+ days away',                '🔄', 'special',   'special',           1,   200);

-- ── Skill snapshots (for trend tracking) ─────────────────────

CREATE TABLE rep_skill_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  skill_category text NOT NULL,
  score numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, skill_category, snapshot_date)
);

CREATE INDEX idx_skill_snapshots_user ON rep_skill_snapshots (user_id, snapshot_date DESC);

-- ── RLS policies ─────────────────────────────────────────────

-- Ranks: readable by all authenticated users
ALTER TABLE ranks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ranks are readable by authenticated users"
  ON ranks FOR SELECT TO authenticated USING (true);

-- XP events
ALTER TABLE xp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own xp events"
  ON xp_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert xp events"
  ON xp_events FOR INSERT WITH CHECK (true);

-- Badges: readable by all authenticated users
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badges are readable by authenticated users"
  ON badges FOR SELECT TO authenticated USING (true);

-- User badges
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own badges"
  ON user_badges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert user badges"
  ON user_badges FOR INSERT WITH CHECK (true);
-- Allow org members to see each other's badges (for social features)
CREATE POLICY "Org members can see each other badges"
  ON user_badges FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_badges.user_id
      AND u.org_id IN (
        SELECT org_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- Skill snapshots
ALTER TABLE rep_skill_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own skill snapshots"
  ON rep_skill_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert skill snapshots"
  ON rep_skill_snapshots FOR INSERT WITH CHECK (true);
-- Managers can see their team's snapshots
CREATE POLICY "Managers can read team skill snapshots"
  ON rep_skill_snapshots FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'manager')
      AND u.org_id = rep_skill_snapshots.org_id
    )
  );

-- ── Helper function: calculate rank from XP ──────────────────

CREATE OR REPLACE FUNCTION get_rank_for_xp(xp int)
RETURNS int AS $$
  SELECT level FROM ranks
  WHERE min_xp <= xp
  ORDER BY min_xp DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ── Trigger: auto-update rank when total_xp changes ──────────

CREATE OR REPLACE FUNCTION update_user_rank()
RETURNS trigger AS $$
BEGIN
  IF NEW.total_xp <> OLD.total_xp THEN
    NEW.rank_level := get_rank_for_xp(NEW.total_xp);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_user_rank
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_user_rank();
