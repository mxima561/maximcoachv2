-- Add analytics fields to trial_sessions table
-- Enables tracking of scenario popularity, completion rates, and user behavior
-- =======================================================================

-- ── Add new columns ────────────────────────────────────────────────────
ALTER TABLE trial_sessions
  ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  ADD COLUMN scenario_type text,
  ADD COLUMN completed boolean DEFAULT false,
  ADD COLUMN duration_seconds int;

-- ── Add index for user lookups ─────────────────────────────────────────
CREATE INDEX idx_trial_sessions_user ON trial_sessions(user_id);

-- ── Add comments ───────────────────────────────────────────────────────
COMMENT ON COLUMN trial_sessions.user_id IS 'User who created the session (for analytics)';
COMMENT ON COLUMN trial_sessions.session_id IS 'Reference to actual session (NULL if session deleted)';
COMMENT ON COLUMN trial_sessions.scenario_type IS 'Scenario attempted (cold_call, discovery, etc.)';
COMMENT ON COLUMN trial_sessions.completed IS 'Whether session was completed (for conversion analytics)';
COMMENT ON COLUMN trial_sessions.duration_seconds IS 'Session duration (for engagement metrics)';
