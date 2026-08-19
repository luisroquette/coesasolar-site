-- Add column to track the last processed operator command message ID
ALTER TABLE public.chatbot_conversas 
ADD COLUMN IF NOT EXISTS last_processed_command_id TEXT DEFAULT NULL;