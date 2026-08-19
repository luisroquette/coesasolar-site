-- Fix ambiguous column reference in get_rag_stats function
CREATE OR REPLACE FUNCTION public.get_rag_stats()
 RETURNS TABLE(total_documents integer, total_chunks integer, total_tokens bigint, documents_by_category jsonb, documents_by_status jsonb, avg_chunks_per_doc double precision, last_sync_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM rag_documents WHERE is_active = true),
    (SELECT COUNT(*)::INTEGER FROM rag_chunks),
    (SELECT COALESCE(SUM(rd.total_tokens), 0) FROM rag_documents rd WHERE rd.is_active = true),
    (SELECT jsonb_object_agg(category, cnt) FROM (
      SELECT category, COUNT(*)::INTEGER as cnt 
      FROM rag_documents WHERE is_active = true 
      GROUP BY category
    ) sub),
    (SELECT jsonb_object_agg(processing_status, cnt) FROM (
      SELECT processing_status, COUNT(*)::INTEGER as cnt 
      FROM rag_documents 
      GROUP BY processing_status
    ) sub),
    (SELECT AVG(chunk_count)::FLOAT FROM rag_documents WHERE is_active = true AND chunk_count > 0),
    (SELECT MAX(oc.last_sync_at) FROM rag_onedrive_config oc);
END;
$function$;