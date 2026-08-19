-- Adicionar colunas para vincular contatos do CRM ao Bitrix24
ALTER TABLE crm_contatos 
  ADD COLUMN IF NOT EXISTS bitrix24_lead_id TEXT,
  ADD COLUMN IF NOT EXISTS ultimo_erro TEXT;

-- Criar índice para buscas rápidas por lead_id do Bitrix24
CREATE INDEX IF NOT EXISTS idx_crm_contatos_bitrix24_lead_id 
  ON crm_contatos(bitrix24_lead_id);

-- Permitir que o sistema (service role) insira contatos no CRM via webhook
CREATE POLICY "Service role can insert contacts" 
ON crm_contatos 
FOR INSERT 
WITH CHECK (true);

-- Permitir que o sistema atualize contatos pelo bitrix24_lead_id
CREATE POLICY "Service role can update contacts by bitrix24_lead_id" 
ON crm_contatos 
FOR UPDATE 
USING (bitrix24_lead_id IS NOT NULL);