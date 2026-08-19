-- Fase 1: Adicionar FK de proposta → contato com CASCADE
-- Quando um contato é excluído, todas as suas propostas são automaticamente excluídas

ALTER TABLE propostas_assinantes 
ADD COLUMN crm_contato_id UUID REFERENCES crm_contatos(id) ON DELETE CASCADE;

-- Criar índice para performance nas consultas de propostas por contato
CREATE INDEX idx_propostas_crm_contato ON propostas_assinantes(crm_contato_id) WHERE crm_contato_id IS NOT NULL;

-- Fase 2: Migração de dados existentes
-- Vincular propostas aos contatos baseado em bitrix24_lead_id, CPF/CNPJ, email ou telefone
UPDATE propostas_assinantes p
SET crm_contato_id = c.id
FROM crm_contatos c
WHERE p.crm_contato_id IS NULL
  AND (
    -- Match por bitrix24_lead_id (mais confiável)
    (p.bitrix24_lead_id IS NOT NULL AND p.bitrix24_lead_id = c.bitrix24_lead_id)
    -- Match por CPF/CNPJ
    OR (p.cliente_cpf_cnpj IS NOT NULL AND TRIM(p.cliente_cpf_cnpj) != '' AND TRIM(p.cliente_cpf_cnpj) = TRIM(c.cpf_cnpj))
    -- Match por email
    OR (p.cliente_email IS NOT NULL AND TRIM(LOWER(p.cliente_email)) != '' AND TRIM(LOWER(p.cliente_email)) = TRIM(LOWER(c.email)))
    -- Match por telefone
    OR (p.cliente_telefone IS NOT NULL AND REGEXP_REPLACE(p.cliente_telefone, '[^0-9]', '', 'g') = REGEXP_REPLACE(c.telefone, '[^0-9]', '', 'g') AND LENGTH(REGEXP_REPLACE(p.cliente_telefone, '[^0-9]', '', 'g')) >= 10)
  );

-- Marcar proposta_id em crm_contatos como deprecated
COMMENT ON COLUMN crm_contatos.proposta_id IS 'DEPRECATED: Usar propostas_assinantes.crm_contato_id para relação inversa. Campo mantido para compatibilidade.';