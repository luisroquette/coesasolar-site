-- Criar tabela de log de retificações de dados no CRM
CREATE TABLE public.crm_data_updates_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id UUID REFERENCES public.chatbot_conversas(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL DEFAULT 'maria',
  entity_type TEXT NOT NULL, -- 'deal', 'contact', 'lead'
  entity_id TEXT NOT NULL, -- Bitrix24 entity ID
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  confirmed_by_client BOOLEAN DEFAULT true,
  bitrix_update_success BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index para consultas por conversa
CREATE INDEX idx_crm_data_updates_conversa ON public.crm_data_updates_log(conversa_id);

-- Index para consultas por entidade
CREATE INDEX idx_crm_data_updates_entity ON public.crm_data_updates_log(entity_type, entity_id);

-- Index para consultas por agente
CREATE INDEX idx_crm_data_updates_agent ON public.crm_data_updates_log(agent_id);

-- Index para consultas por data
CREATE INDEX idx_crm_data_updates_created ON public.crm_data_updates_log(created_at DESC);

-- Enable RLS
ALTER TABLE public.crm_data_updates_log ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários autenticados podem ver os logs
CREATE POLICY "Authenticated users can view CRM update logs" 
ON public.crm_data_updates_log 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Policy: Sistema pode inserir (via service role)
CREATE POLICY "System can insert CRM update logs" 
ON public.crm_data_updates_log 
FOR INSERT 
WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.crm_data_updates_log IS 'Log de todas as retificações de dados feitas pelos agentes de IA no CRM Bitrix24';