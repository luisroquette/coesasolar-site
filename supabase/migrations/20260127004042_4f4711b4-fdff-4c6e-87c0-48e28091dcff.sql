-- Tabela para rastrear jobs de aprendizado em lote
CREATE TABLE public.batch_learning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'paused')),
  total_chunks INTEGER DEFAULT 0,
  processed_chunks INTEGER DEFAULT 0,
  errors_found INTEGER DEFAULT 0,
  rules_extracted INTEGER DEFAULT 0,
  rules_approved INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT
);

-- Tabela para armazenar avaliações retroativas individuais
CREATE TABLE public.batch_learning_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.batch_learning_jobs(id) ON DELETE CASCADE NOT NULL,
  chunk_id UUID NOT NULL,
  document_id UUID,
  pair_index INTEGER DEFAULT 0,
  client_message TEXT NOT NULL,
  sofia_response TEXT NOT NULL,
  scores JSONB DEFAULT '{}',
  overall_score REAL,
  issues JSONB DEFAULT '[]',
  proposed_rule JSONB,
  rule_status TEXT DEFAULT 'pending' CHECK (rule_status IN ('pending', 'approved', 'rejected', 'duplicate', 'skipped')),
  approved_rule_id UUID,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_batch_learning_jobs_status ON public.batch_learning_jobs(status);
CREATE INDEX idx_batch_learning_jobs_created_at ON public.batch_learning_jobs(created_at DESC);
CREATE INDEX idx_batch_learning_evaluations_job_id ON public.batch_learning_evaluations(job_id);
CREATE INDEX idx_batch_learning_evaluations_rule_status ON public.batch_learning_evaluations(rule_status);
CREATE INDEX idx_batch_learning_evaluations_overall_score ON public.batch_learning_evaluations(overall_score);
CREATE INDEX idx_batch_learning_evaluations_chunk_id ON public.batch_learning_evaluations(chunk_id);

-- Enable RLS
ALTER TABLE public.batch_learning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_learning_evaluations ENABLE ROW LEVEL SECURITY;

-- RLS Policies - permitir acesso autenticado para operações
CREATE POLICY "Authenticated users can view batch jobs"
ON public.batch_learning_jobs FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert batch jobs"
ON public.batch_learning_jobs FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update batch jobs"
ON public.batch_learning_jobs FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view evaluations"
ON public.batch_learning_evaluations FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert evaluations"
ON public.batch_learning_evaluations FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update evaluations"
ON public.batch_learning_evaluations FOR UPDATE
TO authenticated
USING (true);