-- Add columns to track voice message preference
ALTER TABLE public.chatbot_conversas 
ADD COLUMN IF NOT EXISTS cliente_aceita_audio boolean DEFAULT null,
ADD COLUMN IF NOT EXISTS audio_oferecido boolean DEFAULT false;