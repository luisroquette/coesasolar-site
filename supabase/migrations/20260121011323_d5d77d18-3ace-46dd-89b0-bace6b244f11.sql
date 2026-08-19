-- Recriar função match_rag_chunks com search_path incluindo extensions
CREATE OR REPLACE FUNCTION public.match_rag_chunks(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5,
  filter_categories TEXT[] DEFAULT '{}',
  filter_agent UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  chunk_index INT,
  content TEXT,
  file_name TEXT,
  category TEXT,
  subcategory TEXT,
  source_path TEXT,
  similarity FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  allowed_categories TEXT[];
BEGIN
  -- Se filter_agent foi passado, buscar categorias permitidas
  IF filter_agent IS NOT NULL AND array_length(filter_categories, 1) IS NULL THEN
    SELECT array_agg(p.category ORDER BY p.priority DESC)
    INTO allowed_categories
    FROM rag_permissions p
    WHERE p.agent_id = filter_agent AND p.access_level != 'none';
  ELSE
    allowed_categories := filter_categories;
  END IF;

  -- Se nenhuma categoria permitida, retornar vazio
  IF allowed_categories IS NULL OR array_length(allowed_categories, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    c.id,
    c.document_id,
    c.chunk_index,
    c.content,
    d.file_name,
    d.category,
    d.subcategory,
    d.source_path,
    (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity,
    c.metadata
  FROM rag_chunks c
  JOIN rag_documents d ON d.id = c.document_id
  WHERE 
    d.is_active = true
    AND d.processing_status = 'completed'
    AND d.category = ANY(allowed_categories)
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;