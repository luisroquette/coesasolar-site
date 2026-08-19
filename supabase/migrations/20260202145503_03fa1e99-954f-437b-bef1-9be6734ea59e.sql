
-- Create persistent embedding cache table
CREATE TABLE IF NOT EXISTS rag_embedding_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash TEXT NOT NULL UNIQUE,
  query_text TEXT NOT NULL,
  embedding extensions.vector(1536) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  use_count INT DEFAULT 1
);

-- Index for fast hash lookup
CREATE INDEX IF NOT EXISTS idx_rag_embedding_cache_hash 
ON rag_embedding_cache (query_hash);

-- Index for cleanup of old entries
CREATE INDEX IF NOT EXISTS idx_rag_embedding_cache_created 
ON rag_embedding_cache (created_at);

-- Function to clean up old cache entries (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_embedding_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rag_embedding_cache
  WHERE last_used_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
