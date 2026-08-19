-- Adicionar coluna para armazenar o ID da mensagem retornado pela Meta API
ALTER TABLE public.chatbot_followups 
ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;