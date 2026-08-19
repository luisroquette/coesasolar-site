-- Tabela para rastrear tentativas de detecção de mensagens não respondidas
CREATE TABLE IF NOT EXISTS public.unanswered_detection_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id UUID NOT NULL REFERENCES public.chatbot_conversas(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  message_content TEXT,
  message_created_at TIMESTAMPTZ,
  detection_delay_seconds INTEGER,
  result TEXT, -- 'reprocessed', 'fallback_sent', 'failed', 'skipped'
  result_details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_unanswered_attempts_conversa 
  ON public.unanswered_detection_attempts(conversa_id);
CREATE INDEX IF NOT EXISTS idx_unanswered_attempts_created 
  ON public.unanswered_detection_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unanswered_attempts_pending 
  ON public.unanswered_detection_attempts(conversa_id, created_at DESC) 
  WHERE processed_at IS NULL;

-- Habilitar RLS
ALTER TABLE public.unanswered_detection_attempts ENABLE ROW LEVEL SECURITY;

-- Policy: apenas service role pode ler/escrever
CREATE POLICY "Service role full access on unanswered_detection_attempts"
  ON public.unanswered_detection_attempts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Configurações padrão do detector
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('unanswered_message_detector_enabled', 'true', 'Habilita o detector de mensagens não respondidas'),
  ('unanswered_detection_window_minutes', '15', 'Minutos mínimos desde a mensagem para detectar (evita falsos positivos)'),
  ('unanswered_max_window_minutes', '60', 'Janela máxima de detecção (mensagens mais antigas são tratadas por outros schedulers)'),
  ('unanswered_batch_size', '30', 'Número máximo de conversas a processar por execução'),
  ('unanswered_cooldown_minutes', '3', 'Cooldown antes de reprocessar mesma conversa'),
  ('unanswered_enable_reprocessing', 'true', 'Tenta reprocessar via webhook antes do fallback'),
  ('unanswered_enable_fallback', 'true', 'Envia mensagem de fallback se reprocessamento falhar')
ON CONFLICT (chave) DO NOTHING;

-- Comentários
COMMENT ON TABLE public.unanswered_detection_attempts IS 'Rastreia tentativas do unanswered-message-detector de recuperar mensagens não respondidas';
COMMENT ON COLUMN public.unanswered_detection_attempts.detection_delay_seconds IS 'Segundos entre a mensagem original e a detecção';
COMMENT ON COLUMN public.unanswered_detection_attempts.result IS 'Resultado: reprocessed, fallback_sent, failed, skipped';