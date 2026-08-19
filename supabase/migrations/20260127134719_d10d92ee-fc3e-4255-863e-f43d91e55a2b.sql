-- Add missing columns to rag_usage_logs
ALTER TABLE public.rag_usage_logs 
  ADD COLUMN IF NOT EXISTS conversa_id UUID REFERENCES public.chatbot_conversas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mensagem_id UUID,
  ADD COLUMN IF NOT EXISTS chunks_used JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS total_chunks INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_similarity NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS client_phone TEXT,
  ADD COLUMN IF NOT EXISTS funnel_stage TEXT;

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_rag_usage_logs_conversa ON public.rag_usage_logs(conversa_id);
CREATE INDEX IF NOT EXISTS idx_rag_usage_logs_phone ON public.rag_usage_logs(client_phone);

-- Create table to track conversion attribution to RAG
CREATE TABLE IF NOT EXISTS public.rag_conversion_attribution (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id UUID REFERENCES public.chatbot_conversas(id) ON DELETE SET NULL,
  conversion_type TEXT NOT NULL,
  rag_influenced BOOLEAN DEFAULT false,
  chunks_in_session JSONB DEFAULT '[]',
  top_chunk_categories TEXT[] DEFAULT '{}',
  avg_similarity_session NUMERIC(5,4),
  total_rag_queries INTEGER DEFAULT 0,
  converted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rag_conversion_conversa ON public.rag_conversion_attribution(conversa_id);
CREATE INDEX IF NOT EXISTS idx_rag_conversion_type ON public.rag_conversion_attribution(conversion_type);

ALTER TABLE public.rag_conversion_attribution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view conversion attribution"
  ON public.rag_conversion_attribution FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role can manage conversion attribution"
  ON public.rag_conversion_attribution FOR ALL
  TO service_role USING (true);

-- Function to get RAG impact analytics
CREATE OR REPLACE FUNCTION public.get_rag_impact_analytics(
  p_days INTEGER DEFAULT 30,
  p_agent_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  period TEXT,
  total_queries BIGINT,
  avg_chunks_used NUMERIC,
  avg_top_similarity NUMERIC,
  queries_with_results BIGINT,
  queries_no_results BIGINT,
  hit_rate NUMERIC,
  conversions_with_rag BIGINT,
  conversions_without_rag BIGINT,
  rag_conversion_rate NUMERIC,
  top_categories JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH usage_stats AS (
    SELECT
      to_char(rul.created_at, 'YYYY-MM-DD') as day,
      COUNT(*) as queries,
      AVG(COALESCE(rul.total_chunks, rul.results_count)) as avg_chunks,
      AVG(rul.top_similarity) as avg_sim,
      COUNT(*) FILTER (WHERE COALESCE(rul.total_chunks, rul.results_count) > 0) as with_results,
      COUNT(*) FILTER (WHERE COALESCE(rul.total_chunks, rul.results_count) = 0) as no_results
    FROM rag_usage_logs rul
    WHERE rul.created_at >= now() - (p_days || ' days')::interval
      AND (p_agent_id IS NULL OR rul.agent_id = p_agent_id)
    GROUP BY to_char(rul.created_at, 'YYYY-MM-DD')
  ),
  conversion_stats AS (
    SELECT
      to_char(rca.converted_at, 'YYYY-MM-DD') as day,
      COUNT(*) FILTER (WHERE rca.rag_influenced = true) as with_rag,
      COUNT(*) FILTER (WHERE rca.rag_influenced = false) as without_rag
    FROM rag_conversion_attribution rca
    WHERE rca.converted_at >= now() - (p_days || ' days')::interval
    GROUP BY to_char(rca.converted_at, 'YYYY-MM-DD')
  ),
  category_stats AS (
    SELECT
      jsonb_agg(jsonb_build_object('category', cat, 'count', cnt) ORDER BY cnt DESC) as top_cats
    FROM (
      SELECT 
        unnest(rca2.top_chunk_categories) as cat,
        COUNT(*) as cnt
      FROM rag_conversion_attribution rca2
      WHERE rca2.converted_at >= now() - (p_days || ' days')::interval
        AND rca2.rag_influenced = true
      GROUP BY unnest(rca2.top_chunk_categories)
      LIMIT 10
    ) sub
  )
  SELECT
    u.day as period,
    u.queries as total_queries,
    ROUND(u.avg_chunks, 2) as avg_chunks_used,
    ROUND(u.avg_sim * 100, 2) as avg_top_similarity,
    u.with_results as queries_with_results,
    u.no_results as queries_no_results,
    ROUND(u.with_results::NUMERIC / NULLIF(u.queries, 0) * 100, 2) as hit_rate,
    COALESCE(c.with_rag, 0) as conversions_with_rag,
    COALESCE(c.without_rag, 0) as conversions_without_rag,
    ROUND(COALESCE(c.with_rag, 0)::NUMERIC / NULLIF(COALESCE(c.with_rag, 0) + COALESCE(c.without_rag, 0), 0) * 100, 2) as rag_conversion_rate,
    (SELECT top_cats FROM category_stats) as top_categories
  FROM usage_stats u
  LEFT JOIN conversion_stats c ON u.day = c.day
  ORDER BY u.day DESC;
END;
$$;

-- Function to attribute conversion to RAG
CREATE OR REPLACE FUNCTION public.attribute_rag_conversion(
  p_conversa_id UUID,
  p_conversion_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rag_queries INTEGER;
  v_chunks JSONB;
  v_categories TEXT[];
  v_avg_sim NUMERIC;
BEGIN
  SELECT 
    COUNT(*),
    jsonb_agg(DISTINCT rul.chunks_used) FILTER (WHERE rul.chunks_used IS NOT NULL),
    ARRAY_AGG(DISTINCT cat) FILTER (WHERE cat IS NOT NULL),
    AVG(rul.top_similarity)
  INTO v_rag_queries, v_chunks, v_categories, v_avg_sim
  FROM rag_usage_logs rul
  LEFT JOIN LATERAL unnest(rul.categories_accessed) AS cat ON true
  WHERE rul.conversa_id = p_conversa_id;

  INSERT INTO rag_conversion_attribution (
    conversa_id,
    conversion_type,
    rag_influenced,
    chunks_in_session,
    top_chunk_categories,
    avg_similarity_session,
    total_rag_queries
  ) VALUES (
    p_conversa_id,
    p_conversion_type,
    COALESCE(v_rag_queries, 0) > 0,
    COALESCE(v_chunks, '[]'),
    COALESCE(v_categories, '{}'),
    v_avg_sim,
    COALESCE(v_rag_queries, 0)
  );
END;
$$;