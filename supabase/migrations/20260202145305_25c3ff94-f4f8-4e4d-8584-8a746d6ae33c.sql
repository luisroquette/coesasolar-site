
-- Fix the HNSW index - use correct operator class for the vector extension
DROP INDEX IF EXISTS idx_rag_chunks_embedding_optimized;

-- Create with explicit extensions schema reference
CREATE INDEX idx_rag_chunks_embedding_optimized 
ON public.rag_chunks 
USING hnsw (embedding extensions.vector_cosine_ops) 
WITH (m = 32, ef_construction = 128);
