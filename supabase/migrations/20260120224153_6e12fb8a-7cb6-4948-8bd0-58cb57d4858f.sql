-- Tabela para registrar uso do RAG por agente
CREATE TABLE public.rag_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  results_count INTEGER NOT NULL DEFAULT 0,
  top_similarity FLOAT,
  documents_accessed TEXT[] DEFAULT '{}',
  categories_accessed TEXT[] DEFAULT '{}',
  tokens_used INTEGER DEFAULT 0,
  response_time_ms INTEGER,
  conversation_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_rag_usage_agent_id ON public.rag_usage_logs(agent_id);
CREATE INDEX idx_rag_usage_created_at ON public.rag_usage_logs(created_at DESC);
CREATE INDEX idx_rag_usage_agent_date ON public.rag_usage_logs(agent_id, created_at DESC);

-- RLS
ALTER TABLE public.rag_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view RAG usage logs"
ON public.rag_usage_logs FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can insert RAG usage logs"
ON public.rag_usage_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Função agregada para métricas por agente
CREATE OR REPLACE FUNCTION public.get_rag_agent_metrics(
  p_agent_id TEXT,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE(
  total_queries INTEGER,
  queries_with_results INTEGER,
  avg_results_count FLOAT,
  avg_similarity FLOAT,
  avg_response_time_ms FLOAT,
  total_tokens_used BIGINT,
  top_categories JSONB,
  top_documents JSONB,
  queries_by_day JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM rag_usage_logs WHERE agent_id = p_agent_id AND created_at > now() - (p_days || ' days')::INTERVAL),
    (SELECT COUNT(*)::INTEGER FROM rag_usage_logs WHERE agent_id = p_agent_id AND results_count > 0 AND created_at > now() - (p_days || ' days')::INTERVAL),
    (SELECT AVG(results_count)::FLOAT FROM rag_usage_logs WHERE agent_id = p_agent_id AND created_at > now() - (p_days || ' days')::INTERVAL),
    (SELECT AVG(top_similarity)::FLOAT FROM rag_usage_logs WHERE agent_id = p_agent_id AND top_similarity IS NOT NULL AND created_at > now() - (p_days || ' days')::INTERVAL),
    (SELECT AVG(response_time_ms)::FLOAT FROM rag_usage_logs WHERE agent_id = p_agent_id AND response_time_ms IS NOT NULL AND created_at > now() - (p_days || ' days')::INTERVAL),
    (SELECT COALESCE(SUM(tokens_used), 0) FROM rag_usage_logs WHERE agent_id = p_agent_id AND created_at > now() - (p_days || ' days')::INTERVAL),
    (SELECT jsonb_object_agg(cat, cnt) FROM (
      SELECT unnest(categories_accessed) as cat, COUNT(*) as cnt 
      FROM rag_usage_logs 
      WHERE agent_id = p_agent_id AND created_at > now() - (p_days || ' days')::INTERVAL
      GROUP BY unnest(categories_accessed)
      ORDER BY cnt DESC
      LIMIT 5
    ) sub),
    (SELECT jsonb_object_agg(doc, cnt) FROM (
      SELECT unnest(documents_accessed) as doc, COUNT(*) as cnt 
      FROM rag_usage_logs 
      WHERE agent_id = p_agent_id AND created_at > now() - (p_days || ' days')::INTERVAL
      GROUP BY unnest(documents_accessed)
      ORDER BY cnt DESC
      LIMIT 5
    ) sub),
    (SELECT jsonb_object_agg(day, cnt) FROM (
      SELECT DATE(created_at)::TEXT as day, COUNT(*) as cnt 
      FROM rag_usage_logs 
      WHERE agent_id = p_agent_id AND created_at > now() - (p_days || ' days')::INTERVAL
      GROUP BY DATE(created_at)
      ORDER BY day DESC
      LIMIT 14
    ) sub);
END;
$$;