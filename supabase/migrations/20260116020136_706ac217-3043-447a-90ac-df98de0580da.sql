-- ═══════════════════════════════════════════════════════════════════════════
-- STUCK LEADS RESCUE - Novas colunas para rastreamento de resgate
-- ═══════════════════════════════════════════════════════════════════════════

-- Adicionar colunas de resgate na tabela chatbot_conversas
ALTER TABLE public.chatbot_conversas
ADD COLUMN IF NOT EXISTS rescue_attempts integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_rescue_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rescue_reason text,
ADD COLUMN IF NOT EXISTS next_rescue_at timestamp with time zone;

-- Índice para buscar leads que precisam de resgate
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_rescue 
ON public.chatbot_conversas (next_rescue_at, rescue_attempts) 
WHERE ended_at IS NULL AND needs_human_fallback IS NOT TRUE;

-- Índice para buscar por última mensagem (leads inativos)
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_last_message 
ON public.chatbot_conversas (last_message_at) 
WHERE ended_at IS NULL;

-- Configuração padrão para o scheduler de resgate
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES (
  'stuck_leads_rescue_enabled',
  'true',
  'Habilita o scheduler automático de resgate de leads travados'
)
ON CONFLICT (chave) DO NOTHING;

-- Comentários para documentação
COMMENT ON COLUMN public.chatbot_conversas.rescue_attempts IS 'Número de tentativas de resgate automático para leads travados (máximo 7)';
COMMENT ON COLUMN public.chatbot_conversas.last_rescue_at IS 'Data/hora da última tentativa de resgate';
COMMENT ON COLUMN public.chatbot_conversas.rescue_reason IS 'Motivo do travamento (missing_tipo_instalacao, missing_fatura, inactivity, etc)';
COMMENT ON COLUMN public.chatbot_conversas.next_rescue_at IS 'Data/hora agendada para próxima tentativa de resgate';