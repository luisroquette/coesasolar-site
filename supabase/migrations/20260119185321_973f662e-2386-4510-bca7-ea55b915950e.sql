-- Add column to track messageId for deduplication
ALTER TABLE public.chatbot_mensagens ADD COLUMN IF NOT EXISTS message_id TEXT;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_chatbot_mensagens_message_id ON public.chatbot_mensagens(message_id) WHERE message_id IS NOT NULL;

-- Add unique constraint to prevent duplicate messageIds (within conversation)
-- We allow the same messageId for different conversations (edge case)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chatbot_mensagens_unique_msg_id ON public.chatbot_mensagens(conversa_id, message_id) WHERE message_id IS NOT NULL;