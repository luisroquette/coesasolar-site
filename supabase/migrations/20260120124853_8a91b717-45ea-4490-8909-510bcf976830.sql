-- Create table for pending messages that failed to send
CREATE TABLE public.chatbot_mensagens_pendentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID REFERENCES public.chatbot_conversas(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  tentativas INTEGER DEFAULT 0,
  max_tentativas INTEGER DEFAULT 5,
  ultimo_erro TEXT,
  ultimo_status_code INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution_status TEXT -- 'sent', 'max_retries', 'cancelled'
);

-- Enable RLS
ALTER TABLE public.chatbot_mensagens_pendentes ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role full access" ON public.chatbot_mensagens_pendentes
  FOR ALL USING (true) WITH CHECK (true);

-- Create index for efficient retry queries
CREATE INDEX idx_mensagens_pendentes_retry ON public.chatbot_mensagens_pendentes (retry_at) 
  WHERE resolved_at IS NULL AND tentativas < max_tentativas;

-- Create index for conversa lookup
CREATE INDEX idx_mensagens_pendentes_conversa ON public.chatbot_mensagens_pendentes (conversa_id);

-- Add comment
COMMENT ON TABLE public.chatbot_mensagens_pendentes IS 'Queue for WhatsApp messages that failed to send and need retry';