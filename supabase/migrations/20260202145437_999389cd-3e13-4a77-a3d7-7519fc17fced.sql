
-- Remove the old unoptimized HNSW index (keep only the optimized one)
DROP INDEX IF EXISTS idx_rag_chunks_embedding;
