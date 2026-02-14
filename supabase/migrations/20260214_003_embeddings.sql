-- US-008: embeddings table with pgvector extension + HNSW index + query function
-- ===============================================================================

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE embeddings (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  content text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  embedding extensions.vector(1536)
);

ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_embeddings_org_id ON embeddings USING btree (org_id);
CREATE INDEX idx_embeddings_hnsw ON embeddings USING hnsw (embedding extensions.vector_ip_ops);

-- Org-scoped RLS via org_id
CREATE POLICY "org_members_read_embeddings" ON embeddings
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid())));

CREATE POLICY "org_members_insert_embeddings" ON embeddings
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid())));

-- Vector similarity search function
CREATE OR REPLACE FUNCTION query_embeddings(
  query_embedding extensions.vector(1536),
  match_threshold float,
  match_org_id uuid
)
RETURNS SETOF embeddings
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM embeddings
  WHERE org_id = match_org_id
  AND embeddings.embedding <#> query_embedding < -match_threshold
  ORDER BY embeddings.embedding <#> query_embedding;
END;
$$;
