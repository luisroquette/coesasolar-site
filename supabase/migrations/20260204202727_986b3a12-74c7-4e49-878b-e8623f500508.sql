-- Fase 3: Armazenamento de Catálogos
-- Adicionar colunas JSONB para catálogos de entidades configuráveis

-- Catálogo de Filas (Queues)
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS queues JSONB DEFAULT '[]'::jsonb;

-- Catálogo de Automações
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS automations JSONB DEFAULT '[]'::jsonb;

-- Catálogo de Proprietários/Responsáveis
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS owners JSONB DEFAULT '[]'::jsonb;

-- Comentários para documentação
COMMENT ON COLUMN public.ai_agents.queues IS 'Catálogo de filas de atendimento configuradas para o agente. Array de QueueDefinition: [{id, label, department?, type?}]';
COMMENT ON COLUMN public.ai_agents.automations IS 'Catálogo de automações/webhooks disponíveis. Array de AutomationDefinition: [{id, label, webhookUrl?, type?, bitrixBpId?}]';
COMMENT ON COLUMN public.ai_agents.owners IS 'Catálogo de proprietários/responsáveis. Array de OwnerDefinition: [{id, label, bitrixUserId?, email?, department?}]';