-- ═══════════════════════════════════════════════════════════════
-- SISTEMA DE APRIMORAMENTO CONTÍNUO DA SOFIA
-- Tabelas para Feedback Loop, Self-Evaluation e Perfil Comportamental
-- ═══════════════════════════════════════════════════════════════

-- 1. TABELA: operator_feedback
-- Captura correções e intervenções dos operadores para aprendizado
CREATE TABLE IF NOT EXISTS public.operator_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id UUID REFERENCES public.chatbot_conversas(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  
  -- Operador que fez a correção
  operator_phone TEXT,
  operator_name TEXT,
  operator_id TEXT,
  
  -- Tipo de feedback
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('takeover', 'correction', 'escalation_resolved', 'explicit_correction')),
  
  -- Contexto da correção
  trigger_message TEXT, -- Mensagem do cliente que causou o problema
  sofia_response TEXT, -- Resposta da Sofia que foi corrigida
  correct_response TEXT, -- Resposta correta (se fornecida via #CORRIGIR)
  correction_reason TEXT, -- Razão da correção
  
  -- Regra aprendida (se gerou uma regra)
  learned_rule_id UUID,
  rule_extraction_status TEXT DEFAULT 'pending' CHECK (rule_extraction_status IN ('pending', 'processing', 'extracted', 'failed', 'skipped')),
  extracted_rule_text TEXT,
  
  -- Metadados
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  client_phone TEXT,
  client_name TEXT
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_operator_feedback_conversa ON public.operator_feedback(conversa_id);
CREATE INDEX IF NOT EXISTS idx_operator_feedback_agent ON public.operator_feedback(agent_id);
CREATE INDEX IF NOT EXISTS idx_operator_feedback_status ON public.operator_feedback(rule_extraction_status);
CREATE INDEX IF NOT EXISTS idx_operator_feedback_created ON public.operator_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operator_feedback_type ON public.operator_feedback(feedback_type);

-- Enable RLS
ALTER TABLE public.operator_feedback ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Service role full access to operator_feedback"
  ON public.operator_feedback
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view operator_feedback"
  ON public.operator_feedback
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. TABELA: response_evaluations
-- Auto-avaliação de respostas da Sofia via LLM secundária
CREATE TABLE IF NOT EXISTS public.response_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id UUID REFERENCES public.chatbot_conversas(id) ON DELETE SET NULL,
  message_id TEXT,
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  
  -- Scores (0-1)
  clarity_score REAL CHECK (clarity_score >= 0 AND clarity_score <= 1),
  accuracy_score REAL CHECK (accuracy_score >= 0 AND accuracy_score <= 1),
  tone_score REAL CHECK (tone_score >= 0 AND tone_score <= 1),
  progression_score REAL CHECK (progression_score >= 0 AND progression_score <= 1),
  overall_score REAL CHECK (overall_score >= 0 AND overall_score <= 1),
  
  -- Análise detalhada
  issues_detected JSONB DEFAULT '[]'::jsonb,
  suggestions TEXT,
  evaluation_reasoning TEXT,
  
  -- Status de revisão
  requires_review BOOLEAN DEFAULT false,
  reviewed_by TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  review_action TEXT CHECK (review_action IN ('approved', 'corrected', 'flagged', 'ignored')),
  
  -- Contexto da avaliação
  client_message TEXT,
  sofia_response TEXT,
  funnel_stage TEXT,
  client_sentiment REAL,
  
  -- Metadados
  model_used TEXT DEFAULT 'google/gemini-2.5-flash-lite',
  evaluation_duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_response_evaluations_conversa ON public.response_evaluations(conversa_id);
CREATE INDEX IF NOT EXISTS idx_response_evaluations_agent ON public.response_evaluations(agent_id);
CREATE INDEX IF NOT EXISTS idx_response_evaluations_overall ON public.response_evaluations(overall_score);
CREATE INDEX IF NOT EXISTS idx_response_evaluations_requires_review ON public.response_evaluations(requires_review) WHERE requires_review = true;
CREATE INDEX IF NOT EXISTS idx_response_evaluations_created ON public.response_evaluations(created_at DESC);

-- Enable RLS
ALTER TABLE public.response_evaluations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Service role full access to response_evaluations"
  ON public.response_evaluations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view and update response_evaluations"
  ON public.response_evaluations
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. TABELA: client_behavioral_profiles
-- Perfis comportamentais persistentes por telefone
CREATE TABLE IF NOT EXISTS public.client_behavioral_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  
  -- Scores de perfil (0-1)
  technical_score REAL DEFAULT 0 CHECK (technical_score >= 0 AND technical_score <= 1),
  objective_score REAL DEFAULT 0 CHECK (objective_score >= 0 AND objective_score <= 1),
  skeptical_score REAL DEFAULT 0 CHECK (skeptical_score >= 0 AND skeptical_score <= 1),
  confused_score REAL DEFAULT 0 CHECK (confused_score >= 0 AND confused_score <= 1),
  elderly_score REAL DEFAULT 0 CHECK (elderly_score >= 0 AND elderly_score <= 1),
  
  -- Perfil dominante calculado
  dominant_profile TEXT CHECK (dominant_profile IN ('technical', 'objective', 'skeptical', 'confused', 'elderly', 'balanced')),
  profile_confidence REAL DEFAULT 0 CHECK (profile_confidence >= 0 AND profile_confidence <= 1),
  
  -- Preferências aprendidas
  preferred_tone TEXT CHECK (preferred_tone IN ('formal', 'informal', 'technical', 'simple')),
  avg_message_length REAL,
  avg_response_time_seconds REAL,
  
  -- Estatísticas de interação
  total_messages_analyzed INTEGER DEFAULT 0,
  total_conversations INTEGER DEFAULT 0,
  objections_count INTEGER DEFAULT 0,
  clarifications_needed INTEGER DEFAULT 0,
  
  -- Metadados
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_conversa_id UUID
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_client_behavioral_profiles_phone ON public.client_behavioral_profiles(phone);
CREATE INDEX IF NOT EXISTS idx_client_behavioral_profiles_dominant ON public.client_behavioral_profiles(dominant_profile);
CREATE INDEX IF NOT EXISTS idx_client_behavioral_profiles_updated ON public.client_behavioral_profiles(last_updated_at DESC);

-- Enable RLS
ALTER TABLE public.client_behavioral_profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Service role full access to client_behavioral_profiles"
  ON public.client_behavioral_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view client_behavioral_profiles"
  ON public.client_behavioral_profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. CONFIGURAÇÕES DE SISTEMA PARA OS NOVOS SISTEMAS
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('self_eval_enabled', 'true', 'Habilita auto-avaliação de respostas da Sofia'),
  ('self_eval_threshold', '0.6', 'Score mínimo para não requerer revisão humana'),
  ('self_eval_model', 'google/gemini-2.5-flash-lite', 'Modelo usado para auto-avaliação'),
  ('behavioral_profile_enabled', 'true', 'Habilita detecção de perfil comportamental'),
  ('behavioral_profile_min_messages', '5', 'Mensagens mínimas para calcular perfil'),
  ('operator_feedback_auto_extract', 'true', 'Extrai regras automaticamente de correções'),
  ('operator_correction_command', '#CORRIGIR', 'Comando para operadores corrigirem respostas')
ON CONFLICT (chave) DO NOTHING;

-- 5. ATUALIZAR TABELA rule_memory PARA SUPORTAR REGRAS APRENDIDAS
-- Adiciona campo learned_from_feedback_id para rastrear origem
ALTER TABLE public.rule_memory 
  ADD COLUMN IF NOT EXISTS learned_from_feedback_id UUID REFERENCES public.operator_feedback(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS learning_source TEXT CHECK (learning_source IN ('manual', 'operator_correction', 'pattern_detection', 'self_eval'));

-- Índice para regras aprendidas
CREATE INDEX IF NOT EXISTS idx_rule_memory_learned_from ON public.rule_memory(learned_from_feedback_id) WHERE learned_from_feedback_id IS NOT NULL;