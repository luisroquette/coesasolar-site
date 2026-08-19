-- Adicionar campos para suporte a múltiplos provedores de WhatsApp
ALTER TABLE public.chatbot_conversas 
ADD COLUMN IF NOT EXISTS whatsapp_provider TEXT DEFAULT 'chatapp',
ADD COLUMN IF NOT EXISTS chatapp_chat_id TEXT;

-- Adicionar índice para busca por chat_id
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_chatapp_chat_id 
ON public.chatbot_conversas(chatapp_chat_id) 
WHERE chatapp_chat_id IS NOT NULL;

-- Tabela para armazenar tokens do ChatApp (renovação automática)
CREATE TABLE IF NOT EXISTS public.chatapp_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  refresh_token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  cabinet_user_id INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS para tabela de tokens (apenas service role pode acessar)
ALTER TABLE public.chatapp_tokens ENABLE ROW LEVEL SECURITY;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_chatapp_tokens_updated_at
BEFORE UPDATE ON public.chatapp_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();