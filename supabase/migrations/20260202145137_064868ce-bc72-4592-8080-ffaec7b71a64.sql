
-- Remove the failed index attempt and create proper supporting indexes
DROP INDEX IF EXISTS idx_rag_chunks_search_optimized;

-- Index for document_id lookups (without the embedding column)
CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc_lookup 
ON public.rag_chunks (document_id) 
WHERE embedding IS NOT NULL;

-- Composite index on rag_documents for faster joins
CREATE INDEX IF NOT EXISTS idx_rag_documents_search 
ON public.rag_documents (id, category, is_active, processing_status);

-- Ensure stats are fresh
ANALYZE rag_chunks;
ANALYZE rag_documents;
