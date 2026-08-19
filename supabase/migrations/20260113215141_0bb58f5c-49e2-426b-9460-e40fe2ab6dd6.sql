-- Add nudge tracking columns to chatbot_conversas
ALTER TABLE public.chatbot_conversas
ADD COLUMN IF NOT EXISTS last_sofia_message_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS awaiting_response BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS nudge_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_nudge_at TIMESTAMPTZ;

-- Add nudge timing configurations
INSERT INTO public.configuracoes_sistema (chave, valor)
VALUES 
  ('nudge_1_delay_minutes', '10'),
  ('nudge_2_delay_minutes', '30'),
  ('nudge_3_delay_minutes', '120')
ON CONFLICT (chave) DO NOTHING;

-- Create index for efficient nudge scheduling queries
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_nudge_scheduling 
ON public.chatbot_conversas (awaiting_response, next_nudge_at, nudge_count) 
WHERE awaiting_response = true AND ended_at IS NULL;