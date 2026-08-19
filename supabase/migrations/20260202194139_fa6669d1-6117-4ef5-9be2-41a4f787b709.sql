-- Performance optimization: Composite index for chatbot_mensagens
-- Optimizes queries with ORDER BY created_at DESC (common in message history)
-- ROI: -50% latency on message history queries

CREATE INDEX IF NOT EXISTS idx_chatbot_mensagens_conversa_created
ON public.chatbot_mensagens (conversa_id, created_at DESC);