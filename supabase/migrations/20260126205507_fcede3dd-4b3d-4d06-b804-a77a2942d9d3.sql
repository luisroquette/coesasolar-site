-- =============================================
-- SOFIA PIPELINE V2 - APENAS ITENS FALTANTES
-- =============================================

-- 1. RAG CACHE - Cache para buscas RAG frequentes
CREATE TABLE IF NOT EXISTS public.rag_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  query_hash TEXT NOT NULL,
  results JSONB NOT NULL DEFAULT '[]',
  hit_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_rag_cache_key ON public.rag_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_rag_cache_expires ON public.rag_cache(expires_at);

ALTER TABLE public.rag_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to rag_cache"
  ON public.rag_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Adicionar configs de Pipeline v2 se não existirem
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('pipeline_v2_enabled', 'false', 'Habilita o Pipeline v2 globalmente'),
  ('pipeline_v2_rollout_percentage', '0', 'Percentual de conversas que usam Pipeline v2 (0-100)'),
  ('pipeline_v2_test_phones', '[]', 'Lista JSON de telefones de teste para Pipeline v2'),
  ('pipeline_v2_memory_ttl_hours', '24', 'TTL padrão para fatos na working_memory (horas)'),
  ('pipeline_v2_max_facts_per_conversation', '100', 'Máximo de fatos por conversa'),
  ('pipeline_v2_rag_enabled', 'true', 'Habilita busca RAG no Pipeline v2'),
  ('pipeline_v2_learning_enabled', 'true', 'Habilita camada de aprendizado no Pipeline v2'),
  ('pipeline_v2_debug_mode', 'false', 'Modo debug com logs verbosos')
ON CONFLICT (chave) DO NOTHING;

-- 3. Cleanup function for expired cache
CREATE OR REPLACE FUNCTION public.cleanup_expired_rag_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM rag_cache WHERE expires_at < now();
END;
$$;