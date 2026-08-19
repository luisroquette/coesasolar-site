-- Adicionar coluna bitrix24_user_id na tabela ai_agents
-- Este campo armazena o ID do usuário/atendente no Bitrix24 para cada agente

ALTER TABLE public.ai_agents
ADD COLUMN IF NOT EXISTS bitrix24_user_id TEXT DEFAULT NULL;

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.ai_agents.bitrix24_user_id IS 'ID do usuário/atendente no Bitrix24 que representa este agente. Usado para atribuir atividades e movimentações no CRM.';