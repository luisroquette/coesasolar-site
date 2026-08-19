
-- Enable RLS on the new cache table (for security compliance)
ALTER TABLE rag_embedding_cache ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role full access to embedding cache"
ON rag_embedding_cache
FOR ALL
USING (true)
WITH CHECK (true);
