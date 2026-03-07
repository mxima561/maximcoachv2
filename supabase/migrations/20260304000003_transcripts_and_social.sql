-- Transcript Analysis Pipeline + Social Feature Extensions
-- ========================================================

-- ── Call transcripts for analysis ────────────────────────────

CREATE TABLE call_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Uploaded Call',
  raw_text text NOT NULL,
  source text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'paste', 'api', 'recording')),
  duration_seconds int,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'analyzed', 'failed')),
  analysis jsonb,
  -- analysis format: {
  --   summary: string,
  --   strengths: [{skill, description, example_quote}],
  --   weaknesses: [{skill, description, example_quote, suggested_drill_ids}],
  --   overall_rating: number,
  --   talk_ratio: number,
  --   key_moments: [{timestamp, type, description}],
  --   generated_drill_ids: [uuid]
  -- }
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transcripts_user ON call_transcripts (user_id, created_at DESC);
CREATE INDEX idx_transcripts_status ON call_transcripts (status) WHERE status IN ('pending', 'processing');

-- ── Extend h2h_matches with scoring ─────────────────────────

ALTER TABLE h2h_matches
  ADD COLUMN IF NOT EXISTS challenger_score int,
  ADD COLUMN IF NOT EXISTS opponent_score int,
  ADD COLUMN IF NOT EXISTS challenger_session_id uuid REFERENCES sessions(id),
  ADD COLUMN IF NOT EXISTS opponent_session_id uuid REFERENCES sessions(id),
  ADD COLUMN IF NOT EXISTS winner_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS scored_at timestamptz;

-- ── Extend clips with title and visibility ───────────────────

ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS title text DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- ── Clip reactions (replace jsonb with proper table) ─────────

CREATE TABLE clip_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('fire', 'clap', 'mind_blown', 'trophy', 'thumbs_up')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(clip_id, user_id, reaction)
);

CREATE INDEX idx_clip_reactions_clip ON clip_reactions (clip_id);

-- ── RLS policies ─────────────────────────────────────────────

ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own transcripts"
  ON call_transcripts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transcripts"
  ON call_transcripts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can manage transcripts"
  ON call_transcripts FOR ALL WITH CHECK (true);

ALTER TABLE clip_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can read clip reactions"
  ON clip_reactions FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clips c
      JOIN users u ON u.org_id = c.org_id
      WHERE c.id = clip_reactions.clip_id AND u.id = auth.uid()
    )
  );
CREATE POLICY "Users can manage own reactions"
  ON clip_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reactions"
  ON clip_reactions FOR DELETE USING (auth.uid() = user_id);
