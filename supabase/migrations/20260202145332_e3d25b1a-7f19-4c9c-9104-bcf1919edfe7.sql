
-- Fix the match_rag_chunks function to work with vector type in extensions schema
-- The issue is the search_path doesn't include extensions

CREATE OR REPLACE FUNCTION public.match_rag_chunks(
  query_embedding extensions.vector, 
  match_threshold double precision, 
  match_count integer, 
  filter_categories text[] DEFAULT '{}'::text[], 
  filter_agent text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid, 
  document_id uuid, 
  chunk_index integer, 
  content text, 
  file_name text, 
  category text, 
  subcategory text, 
  source_path text, 
  similarity double precision, 
  metadata jsonb, 
  learning_type text, 
  is_exemplar boolean, 
  exemplar_reason text
)
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
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
    c.is_exemplar DESC NULLS LAST,
    c.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;
