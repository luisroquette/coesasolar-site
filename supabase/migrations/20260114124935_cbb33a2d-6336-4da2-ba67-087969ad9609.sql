-- Add pending task tracking fields to chatbot_conversas
ALTER TABLE public.chatbot_conversas 
ADD COLUMN IF NOT EXISTS pending_task TEXT,
ADD COLUMN IF NOT EXISTS pending_task_created_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pending_task_retries INT DEFAULT 0;