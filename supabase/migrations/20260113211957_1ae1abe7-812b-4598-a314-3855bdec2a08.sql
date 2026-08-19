-- Add columns for Bitrix24 progressive sync in chatbot_conversas
ALTER TABLE chatbot_conversas 
ADD COLUMN IF NOT EXISTS bitrix24_lead_id TEXT;

ALTER TABLE chatbot_conversas 
ADD COLUMN IF NOT EXISTS dados_coletados JSONB DEFAULT '{}';

ALTER TABLE chatbot_conversas 
ADD COLUMN IF NOT EXISTS bitrix24_stage TEXT;

ALTER TABLE chatbot_conversas 
ADD COLUMN IF NOT EXISTS arquivos_anexados JSONB DEFAULT '[]';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_bitrix24_lead_id 
ON chatbot_conversas(bitrix24_lead_id) 
WHERE bitrix24_lead_id IS NOT NULL;

-- Add configurations for stage requirements
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('sofia_required_fields_proposta_inicial', 'consumo_ou_valor,distribuidora', 'Campos mínimos para mover para Proposta Inicial')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('sofia_required_fields_proposta_definitiva', 'cpf_cnpj,endereco,fatura,documento_identidade', 'Campos mínimos para mover para Proposta Definitiva')
ON CONFLICT (chave) DO NOTHING;