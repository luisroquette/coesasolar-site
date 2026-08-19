-- Tabela para armazenar follow-ups pendentes/enviados
CREATE TABLE IF NOT EXISTS public.chatbot_followups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id UUID NOT NULL REFERENCES public.chatbot_conversas(id) ON DELETE CASCADE,
  cliente_nome TEXT,
  cliente_telefone TEXT,
  cliente_email TEXT,
  followup_stage TEXT NOT NULL, -- 'd1', 'd3', 'd7'
  message TEXT NOT NULL,
  lead_score INTEGER DEFAULT 0,
  detected_objection TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'skipped'
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  error_message TEXT
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_chatbot_followups_status ON chatbot_followups(status);
CREATE INDEX IF NOT EXISTS idx_chatbot_followups_conversa ON chatbot_followups(conversa_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_followups_created ON chatbot_followups(created_at);

-- Enable RLS
ALTER TABLE public.chatbot_followups ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - admins podem ver tudo
CREATE POLICY "Admins can view all followups" 
ON public.chatbot_followups 
FOR SELECT 
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update followups" 
ON public.chatbot_followups 
FOR UPDATE 
USING (public.is_admin(auth.uid()));

-- Service role pode inserir (para a edge function)
CREATE POLICY "Service role can insert followups" 
ON public.chatbot_followups 
FOR INSERT 
WITH CHECK (true);

-- Adicionar coluna de telefone na tabela de conversas se não existir
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS cliente_telefone TEXT;