-- =============================================
-- SOFIA PIPELINE 2.0 - FASE 0: MEMORIA PERSISTENTE
-- =============================================

-- 1. WORKING MEMORY: Armazena fatos da conversa atual
CREATE TABLE public.working_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID REFERENCES public.chatbot_conversas(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('fact', 'rule', 'preference', 'commitment', 'objection', 'context')),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  confidence FLOAT DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL CHECK (source IN ('user', 'inferred', 'operator', 'system', 'extraction', 'rag')),
  valid_until TIMESTAMPTZ,
  turn_number INT DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices para busca rapida
CREATE INDEX idx_wm_conversa ON public.working_memory(conversa_id);
CREATE INDEX idx_wm_type_key ON public.working_memory(memory_type, key);
CREATE INDEX idx_wm_valid ON public.working_memory(valid_until) WHERE valid_until IS NOT NULL;

-- Trigger para updated_at
CREATE TRIGGER update_working_memory_updated_at
  BEFORE UPDATE ON public.working_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.working_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on working_memory"
  ON public.working_memory
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. RULE MEMORY: Regras persistentes por agente
CREATE TABLE public.rule_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  rule_type TEXT NOT NULL CHECK (rule_type IN ('hard_constraint', 'soft_preference', 'learned_pattern', 'guardrail', 'fallback')),
  name TEXT NOT NULL,
  description TEXT,
  condition JSONB NOT NULL DEFAULT '{}',
  action JSONB NOT NULL DEFAULT '{}',
  priority INT NOT NULL DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  learned_from TEXT CHECK (learned_from IN ('operator_correction', 'explicit_config', 'ml_inferred', 'manual', 'system')),
  confidence FLOAT DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  times_applied INT DEFAULT 0,
  last_applied_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX idx_rm_agent ON public.rule_memory(agent_id);
CREATE INDEX idx_rm_type ON public.rule_memory(rule_type);
CREATE INDEX idx_rm_active ON public.rule_memory(is_active) WHERE is_active = true;
CREATE INDEX idx_rm_priority ON public.rule_memory(priority DESC);

-- Trigger para updated_at
CREATE TRIGGER update_rule_memory_updated_at
  BEFORE UPDATE ON public.rule_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.rule_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on rule_memory"
  ON public.rule_memory
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. INTERACTION PATTERNS: Padroes aprendidos de interacoes
CREATE TABLE public.interaction_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('objection_response', 'successful_close', 'escalation_trigger', 'disqualification', 'engagement', 'recovery')),
  trigger_pattern JSONB NOT NULL,
  successful_response JSONB,
  failure_response JSONB,
  success_rate FLOAT DEFAULT 0.5 CHECK (success_rate >= 0 AND success_rate <= 1),
  sample_count INT DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX idx_ip_agent ON public.interaction_patterns(agent_id);
CREATE INDEX idx_ip_type ON public.interaction_patterns(pattern_type);
CREATE INDEX idx_ip_success ON public.interaction_patterns(success_rate DESC);

-- Trigger
CREATE TRIGGER update_interaction_patterns_updated_at
  BEFORE UPDATE ON public.interaction_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.interaction_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on interaction_patterns"
  ON public.interaction_patterns
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. PIPELINE EXECUTION LOG: Rastreamento de cada execucao do pipeline
CREATE TABLE public.pipeline_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID REFERENCES public.chatbot_conversas(id) ON DELETE SET NULL,
  message_id TEXT,
  pipeline_version TEXT NOT NULL DEFAULT 'v2.0',
  
  -- Metricas de cada layer
  intake_duration_ms INT,
  intake_result JSONB,
  
  context_duration_ms INT,
  context_memory_count INT,
  context_rules_count INT,
  
  reasoning_duration_ms INT,
  reasoning_model TEXT,
  reasoning_tokens_in INT,
  reasoning_tokens_out INT,
  reasoning_tool_calls JSONB,
  
  action_duration_ms INT,
  actions_executed JSONB,
  
  validation_duration_ms INT,
  validation_passed BOOLEAN,
  validation_blocks JSONB,
  
  learning_duration_ms INT,
  facts_saved INT,
  patterns_updated INT,
  
  -- Totais
  total_duration_ms INT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX idx_pel_conversa ON public.pipeline_execution_log(conversa_id);
CREATE INDEX idx_pel_created ON public.pipeline_execution_log(created_at DESC);
CREATE INDEX idx_pel_success ON public.pipeline_execution_log(success);

-- RLS
ALTER TABLE public.pipeline_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on pipeline_execution_log"
  ON public.pipeline_execution_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5. FEATURE FLAG: pipeline_v2_enabled
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES (
  'pipeline_v2_enabled',
  'false',
  'Habilita o Pipeline Estrutural Sofia 2.0. Quando false, usa o webhook antigo.'
)
ON CONFLICT (chave) DO UPDATE SET valor = 'false', updated_at = now();

-- 6. Configuracoes adicionais do Pipeline
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('pipeline_v2_rollout_percentage', '0', 'Porcentagem de conversas que usam Pipeline v2 (0-100)'),
  ('pipeline_v2_test_phones', '[]', 'Lista JSON de telefones de teste que sempre usam Pipeline v2'),
  ('pipeline_memory_ttl_hours', '168', 'Tempo de vida da working_memory em horas (default 7 dias)'),
  ('pipeline_max_facts_per_conversation', '100', 'Limite maximo de fatos por conversa na working_memory')
ON CONFLICT (chave) DO NOTHING;