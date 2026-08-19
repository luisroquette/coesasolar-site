-- Adicionar campos para controle de escalação humana
ALTER TABLE public.chatbot_conversas
ADD COLUMN IF NOT EXISTS human_agent_id UUID,
ADD COLUMN IF NOT EXISTS human_agent_nome TEXT,
ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS escalation_reason TEXT;

-- Criar índice para consultas de conversas aguardando humano
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_needs_human 
ON public.chatbot_conversas (needs_human_fallback) 
WHERE needs_human_fallback = true;

-- Comentários para documentação
COMMENT ON COLUMN public.chatbot_conversas.human_agent_id IS 'ID do atendente que assumiu a conversa';
COMMENT ON COLUMN public.chatbot_conversas.human_agent_nome IS 'Nome do atendente que assumiu';
COMMENT ON COLUMN public.chatbot_conversas.escalated_at IS 'Timestamp de quando foi escalado para humano';
COMMENT ON COLUMN public.chatbot_conversas.escalation_reason IS 'Última mensagem que causou a escalação';