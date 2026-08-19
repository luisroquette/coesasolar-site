-- Migration: Add fields for human interaction tracking and proposal link deduplication
-- Supports 7 sales performance optimizations for sofIA

-- 1. Add human interaction tracking fields to chatbot_conversas
ALTER TABLE public.chatbot_conversas 
ADD COLUMN IF NOT EXISTS last_human_message_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS human_intervention_count INTEGER DEFAULT 0;

-- 2. Add comment to explain the fields
COMMENT ON COLUMN public.chatbot_conversas.last_human_message_at IS 'Timestamp of last message from human agent - used for cooldown after human interaction';
COMMENT ON COLUMN public.chatbot_conversas.human_intervention_count IS 'Number of times human intervention occurred in this conversation';

-- 3. Create index for efficient querying of conversations with recent human activity
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_last_human_message 
ON public.chatbot_conversas (last_human_message_at DESC) 
WHERE last_human_message_at IS NOT NULL;