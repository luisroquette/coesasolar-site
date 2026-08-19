-- Drop existing function first due to return type change
DROP FUNCTION IF EXISTS public.match_rag_chunks(vector, double precision, integer, text[], text);

-- Recreate with new return type including learning_type and exemplar fields
CREATE FUNCTION public.match_rag_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_categories text[] DEFAULT '{}',
  filter_agent text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  file_name text,
  category text,
  subcategory text,
  source_path text,
  similarity float,
  metadata jsonb,
  learning_type text,
  is_exemplar boolean,
  exemplar_reason text
)
LANGUAGE plpgsql
SET search_path = public
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
    c.metadata,
    c.learning_type,
    c.is_exemplar,
    c.exemplar_reason
  FROM rag_chunks c
  JOIN rag_documents d ON d.id = c.document_id
  WHERE 
    d.is_active = true
    AND d.processing_status = 'completed'
    AND d.category = ANY(allowed_categories)
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) > match_threshold
  ORDER BY 
    c.is_exemplar DESC NULLS LAST,  -- Exemplars first
    c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create specialized function to fetch exemplars for training context
CREATE OR REPLACE FUNCTION public.get_learning_exemplars(
  p_learning_type text,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  content text,
  file_name text,
  category text,
  subcategory text,
  learning_type text,
  exemplar_reason text,
  quality_score int
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT 
    c.id,
    c.content,
    d.file_name,
    d.category,
    d.subcategory,
    c.learning_type,
    c.exemplar_reason,
    COALESCE((d.metadata->'analysis'->>'quality_score')::int, 50) as quality_score
  FROM rag_chunks c
  JOIN rag_documents d ON d.id = c.document_id
  WHERE 
    d.is_active = true
    AND c.is_exemplar = true
    AND (p_learning_type = 'all' OR c.learning_type = p_learning_type)
  ORDER BY 
    COALESCE((d.metadata->'analysis'->>'quality_score')::int, 50) DESC,
    d.created_at DESC
  LIMIT p_limit;
$$;