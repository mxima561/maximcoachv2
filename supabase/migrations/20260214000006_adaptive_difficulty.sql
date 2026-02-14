-- US-049: Adaptive difficulty engine — ELO rating + history
-- =========================================================

-- Add elo_rating to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS elo_rating int NOT NULL DEFAULT 1000;

-- ELO rating history for trend tracking
CREATE TABLE IF NOT EXISTS elo_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_rating int NOT NULL,
  new_rating int NOT NULL,
  session_score int NOT NULL,
  change int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_elo_history_user ON elo_history (user_id, created_at DESC);

-- RLS
ALTER TABLE elo_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own elo history"
  ON elo_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert elo history"
  ON elo_history FOR INSERT
  WITH CHECK (true);
