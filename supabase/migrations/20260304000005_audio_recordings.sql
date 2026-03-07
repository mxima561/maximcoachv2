-- Audio Recordings
-- =================
-- Stores compressed audio files for session replay

CREATE TABLE audio_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  format text NOT NULL DEFAULT 'opus',  -- 'opus' | 'mp3'
  storage_path text NOT NULL,           -- path in Supabase Storage
  duration_seconds integer,
  file_size_bytes integer,
  original_size_bytes integer,          -- raw PCM size for compression ratio
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audio_recordings_session ON audio_recordings (session_id);
CREATE INDEX idx_audio_recordings_user ON audio_recordings (user_id);

ALTER TABLE audio_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own audio recordings"
  ON audio_recordings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service can insert audio recordings"
  ON audio_recordings FOR INSERT WITH CHECK (true);
