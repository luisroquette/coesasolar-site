-- Tabela para regras pendentes de aprovação (extraídas de conversas)
CREATE TABLE public.pending_learned_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL DEFAULT 'behavior',
  priority INTEGER NOT NULL DEFAULT 50,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  conditions JSONB,
  actions JSONB,
  source_conversation_id TEXT,
  source_pair_index INTEGER,
  client_message_sample TEXT,
  sofia_response_sample TEXT,
  issue_detected TEXT,
  learning_type TEXT NOT NULL DEFAULT 'failure' CHECK (learning_type IN ('success', 'failure', 'neutral')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para consultas rápidas
CREATE INDEX idx_pending_rules_status ON public.pending_learned_rules(status);
CREATE INDEX idx_pending_rules_confidence ON public.pending_learned_rules(confidence DESC);
CREATE INDEX idx_pending_rules_learning_type ON public.pending_learned_rules(learning_type);

-- Tabela para exemplos few-shot extraídos
CREATE TABLE public.few_shot_examples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  context TEXT,
  input TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  source_conversation_id TEXT,
  quality_score NUMERIC(5,2) DEFAULT 50,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para few-shots
CREATE INDEX idx_few_shot_agent ON public.few_shot_examples(agent_id);
CREATE INDEX idx_few_shot_approved ON public.few_shot_examples(is_approved, is_active);
CREATE INDEX idx_few_shot_quality ON public.few_shot_examples(quality_score DESC);

-- Tabela para log de conversas processadas (evitar reprocessamento)
CREATE TABLE public.learning_processed_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  message_count INTEGER,
  rules_extracted INTEGER DEFAULT 0,
  few_shots_created INTEGER DEFAULT 0,
  processing_time_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'completed',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice único para evitar reprocessamento
CREATE UNIQUE INDEX idx_learning_content_hash ON public.learning_processed_conversations(content_hash);

-- Enable RLS
ALTER TABLE public.pending_learned_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.few_shot_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_processed_conversations ENABLE ROW LEVEL SECURITY;

-- Políticas para admin (authenticated users)
CREATE POLICY "Authenticated users can view pending rules"
  ON public.pending_learned_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage pending rules"
  ON public.pending_learned_rules FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view few-shot examples"
  ON public.few_shot_examples FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage few-shot examples"
  ON public.few_shot_examples FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view processed conversations"
  ON public.learning_processed_conversations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert processed conversations"
  ON public.learning_processed_conversations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Service role access (for edge functions)
CREATE POLICY "Service role full access pending rules"
  ON public.pending_learned_rules FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access few-shot examples"
  ON public.few_shot_examples FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access processed conversations"
  ON public.learning_processed_conversations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_pending_rules_updated_at
  BEFORE UPDATE ON public.pending_learned_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_few_shot_examples_updated_at
  BEFORE UPDATE ON public.few_shot_examples
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();