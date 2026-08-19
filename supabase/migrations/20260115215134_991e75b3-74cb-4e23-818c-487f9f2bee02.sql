-- Create table to log detected typos for analytics
CREATE TABLE public.distribuidora_typos_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  conversa_id UUID REFERENCES public.chatbot_conversas(id) ON DELETE SET NULL,
  cliente_telefone TEXT,
  typo_detectado TEXT NOT NULL,
  sugestao TEXT NOT NULL,
  confirmado BOOLEAN DEFAULT NULL,
  distribuidora_final TEXT,
  contexto_mensagem TEXT
);

-- Enable RLS
ALTER TABLE public.distribuidora_typos_log ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role can manage typos log"
ON public.distribuidora_typos_log
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for analytics queries
CREATE INDEX idx_typos_log_typo ON public.distribuidora_typos_log(typo_detectado);
CREATE INDEX idx_typos_log_sugestao ON public.distribuidora_typos_log(sugestao);
CREATE INDEX idx_typos_log_created_at ON public.distribuidora_typos_log(created_at DESC);

-- Add comment
COMMENT ON TABLE public.distribuidora_typos_log IS 'Log de typos de distribuidoras detectados pela sofIA para análise e melhoria contínua';