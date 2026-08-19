-- Segregate WhatsApp conversations by agent (sofia, maria, julia, iago, jaime)
ALTER TABLE public.chatbot_conversas
ADD COLUMN IF NOT EXISTS agent_id TEXT NOT NULL DEFAULT 'sofia';

-- Fast lookup for active conversation per (agent, phone)
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_agent_phone_active
ON public.chatbot_conversas (agent_id, cliente_telefone)
WHERE ended_at IS NULL;

-- Optional helper index for analytics/debug
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_agent_created_at
ON public.chatbot_conversas (agent_id, created_at DESC);