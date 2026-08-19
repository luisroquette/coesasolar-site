-- Add resolution tracking columns to chatbot_conversas
ALTER TABLE public.chatbot_conversas
ADD COLUMN IF NOT EXISTS human_resolved_at timestamptz,
ADD COLUMN IF NOT EXISTS human_resolution_time_seconds integer;

-- Update whatsapp_atendentes with more metrics
ALTER TABLE public.whatsapp_atendentes
ADD COLUMN IF NOT EXISTS escalacoes_resolvidas integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tempo_medio_resolucao_segundos integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tempo_resolucao_segundos bigint DEFAULT 0;

-- Add index for faster metrics queries
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_escalated_at ON public.chatbot_conversas(escalated_at) WHERE escalated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_atendente_notificado ON public.chatbot_conversas(atendente_notificado_id) WHERE atendente_notificado_id IS NOT NULL;