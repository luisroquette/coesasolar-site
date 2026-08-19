-- Table to track auto-learning scheduler runs
CREATE TABLE IF NOT EXISTS public.auto_learning_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  stats JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.auto_learning_runs ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can view auto_learning_runs"
  ON public.auto_learning_runs
  FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert auto_learning_runs"
  ON public.auto_learning_runs
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Service role full access on auto_learning_runs"
  ON public.auto_learning_runs
  FOR ALL
  USING (auth.role() = 'service_role');

-- Index for faster queries
CREATE INDEX idx_auto_learning_runs_started_at ON public.auto_learning_runs(started_at DESC);
CREATE INDEX idx_auto_learning_runs_status ON public.auto_learning_runs(status);

-- Add learning_source to rule_memory if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'rule_memory' 
    AND column_name = 'learning_source'
  ) THEN
    ALTER TABLE public.rule_memory ADD COLUMN learning_source TEXT;
  END IF;
END $$;

-- Insert default configuration
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('auto_learning_scheduler_enabled', 'false', 'Habilitar scheduler de aprendizado automático semanal'),
  ('auto_learning_scheduler_config', '{"enabled":true,"sync_folder_path":"Knowledge Base/Scripts","batch_size":30,"auto_approve_threshold":0.8,"max_rules_per_run":20,"notify_on_completion":true}', 'Configuração do scheduler de aprendizado automático')
ON CONFLICT (chave) DO NOTHING;