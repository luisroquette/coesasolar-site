CREATE OR REPLACE FUNCTION public.match_rag_chunks_v2(
  query_embedding extensions.vector,
  match_threshold float DEFAULT 0.55,
  match_count int DEFAULT 3,
  filter_chunk_types text[] DEFAULT NULL,
  filter_funnel_stage text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  chunk_type text,
  metadata jsonb,
  document_category text,
  document_name text
)
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.content,
    (1 - (c.embedding <=> query_embedding))::float as similarity,
    c.chunk_type,
    c.metadata,
    d.category as document_category,
    d.file_name as document_name
  FROM rag_chunks c
  JOIN rag_documents d ON c.document_id = d.id
  WHERE c.is_active = true
    AND c.quality_score > 0.5
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) > match_threshold
    AND (filter_chunk_types IS NULL OR c.chunk_type = ANY(filter_chunk_types))
    AND (filter_funnel_stage IS NULL OR c.metadata->>'funnel_stage' = filter_funnel_stage 
         OR c.metadata->>'funnel_stage' IS NULL)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;