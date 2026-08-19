-- Drop tabela chatapp_tokens (obsoleta - era usada para gerenciar tokens ChatApp)
DROP TABLE IF EXISTS public.chatapp_tokens;

-- Remover coluna chatapp_operator_id da tabela whatsapp_atendentes
ALTER TABLE public.whatsapp_atendentes 
DROP COLUMN IF EXISTS chatapp_operator_id;

-- Remover coluna chatapp_chat_id da tabela chatbot_conversas
ALTER TABLE public.chatbot_conversas 
DROP COLUMN IF EXISTS chatapp_chat_id;

-- Atualizar todas as conversas existentes para usar zapi como provider
UPDATE public.chatbot_conversas 
SET whatsapp_provider = 'zapi' 
WHERE whatsapp_provider = 'chatapp' OR whatsapp_provider IS NULL;