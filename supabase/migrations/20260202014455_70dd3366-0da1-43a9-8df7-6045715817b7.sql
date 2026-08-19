-- ═══════════════════════════════════════════════════════════════
-- TABELA: Rate Limit Violations Log
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.rate_limit_violations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  violation_type TEXT NOT NULL,
  request_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_created_at 
  ON public.rate_limit_violations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_phone 
  ON public.rate_limit_violations(phone, created_at DESC);

-- Enable RLS
ALTER TABLE public.rate_limit_violations ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (internal use only)
CREATE POLICY "Service role full access rate_limit_violations"
  ON public.rate_limit_violations FOR ALL
  USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- TABELA: LLM Usage Log (Cost Tracking)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.llm_usage_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 8) NOT NULL DEFAULT 0,
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  conversa_id UUID REFERENCES public.chatbot_conversas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for cost analytics (simple, no partial index)
CREATE INDEX IF NOT EXISTS idx_llm_usage_log_created_at 
  ON public.llm_usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_log_model 
  ON public.llm_usage_log(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_log_agent 
  ON public.llm_usage_log(agent_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.llm_usage_log ENABLE ROW LEVEL SECURITY;

-- Policy: Service role full access
CREATE POLICY "Service role full access llm_usage_log"
  ON public.llm_usage_log FOR ALL
  USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- CONFIGURAÇÕES: Rate Limiting & Cost Monitoring
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('entry_rate_limit_enabled', 'true', 'Habilita rate limiting no entry point do webhook'),
  ('entry_rate_limit_max_per_minute', '30', 'Max requisições por minuto por telefone'),
  ('entry_rate_limit_max_per_window', '100', 'Max requisições em janela de 5 minutos por telefone'),
  ('entry_rate_limit_window_seconds', '300', 'Tamanho da janela de rate limiting (segundos)'),
  ('entry_rate_limit_global_max_per_minute', '500', 'Max requisições globais por minuto'),
  ('entry_rate_limit_soft_limit_per_minute', '20', 'Limite soft (alerta) por minuto por telefone'),
  ('llm_daily_budget_usd', '50', 'Budget diário para custos LLM (USD)'),
  ('llm_monthly_budget_usd', '1000', 'Budget mensal para custos LLM (USD)'),
  ('llm_alert_threshold_percent', '80', 'Threshold para alerta de custo (% do budget)'),
  ('llm_critical_threshold_percent', '95', 'Threshold crítico para alerta (% do budget)'),
  ('llm_alerts_enabled', 'true', 'Habilita alertas automáticos de custo LLM')
ON CONFLICT (chave) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- VIEW: Daily LLM Cost Summary
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_llm_daily_costs AS
SELECT 
  DATE(created_at) AS date,
  model,
  agent_id,
  COUNT(*) AS calls,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(cost_usd) AS total_cost_usd,
  AVG(cost_usd) AS avg_cost_per_call
FROM public.llm_usage_log
GROUP BY DATE(created_at), model, agent_id
ORDER BY date DESC, total_cost_usd DESC;

-- ═══════════════════════════════════════════════════════════════
-- VIEW: Monthly LLM Cost Summary
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_llm_monthly_costs AS
SELECT 
  TO_CHAR(created_at, 'YYYY-MM') AS month,
  model,
  agent_id,
  COUNT(*) AS calls,
  SUM(cost_usd) AS total_cost_usd,
  AVG(cost_usd) AS avg_cost_per_call
FROM public.llm_usage_log
GROUP BY TO_CHAR(created_at, 'YYYY-MM'), model, agent_id
ORDER BY month DESC, total_cost_usd DESC;