-- ═══════════════════════════════════════════════════════════════
-- INFRA METRICS TABLE - Sprint 1 Escalabilidade
-- Monitora: DB pool, rate limits, locks, API quotas
-- ═══════════════════════════════════════════════════════════════

-- Tabela de métricas de infraestrutura
CREATE TABLE IF NOT EXISTS public.infra_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  threshold_warning NUMERIC,
  threshold_critical NUMERIC,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para limpeza de métricas antigas e consultas recentes
CREATE INDEX idx_infra_metrics_created ON public.infra_metrics(created_at DESC);
CREATE INDEX idx_infra_metrics_name_created ON public.infra_metrics(metric_name, created_at DESC);

-- RLS: Apenas admins podem ver métricas
ALTER TABLE public.infra_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view infra_metrics"
ON public.infra_metrics FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "System can insert infra_metrics"
ON public.infra_metrics FOR INSERT
WITH CHECK (true);

-- Tabela de violações de rate limit (se não existir)
CREATE TABLE IF NOT EXISTS public.rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  violation_type TEXT NOT NULL,
  request_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para consultas de violações
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_created 
ON public.rate_limit_violations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_phone 
ON public.rate_limit_violations(phone, created_at DESC);

-- RLS para rate_limit_violations
ALTER TABLE public.rate_limit_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view rate_limit_violations"
ON public.rate_limit_violations FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "System can insert rate_limit_violations"
ON public.rate_limit_violations FOR INSERT
WITH CHECK (true);

-- Função para limpar métricas antigas (manter 7 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_infra_metrics()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.infra_metrics
  WHERE created_at < now() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Função para limpar violações antigas (manter 30 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limit_violations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.rate_limit_violations
  WHERE created_at < now() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;