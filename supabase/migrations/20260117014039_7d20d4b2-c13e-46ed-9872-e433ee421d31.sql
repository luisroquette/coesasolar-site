-- Script de limpeza de duplicatas no CRM
-- Consolida contatos duplicados mantendo o registro mais antigo e atualiza as referências

-- 1. Criar tabela temporária com o contato a manter (mais antigo) por identificador único
CREATE TEMP TABLE contatos_a_manter AS
WITH identificadores AS (
  SELECT 
    id,
    COALESCE(NULLIF(TRIM(cpf_cnpj), ''), NULLIF(TRIM(email), ''), NULLIF(TRIM(telefone), '')) as identificador_unico,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(NULLIF(TRIM(cpf_cnpj), ''), NULLIF(TRIM(email), ''), NULLIF(TRIM(telefone), ''))
      ORDER BY created_at ASC
    ) as rn
  FROM crm_contatos
  WHERE COALESCE(NULLIF(TRIM(cpf_cnpj), ''), NULLIF(TRIM(email), ''), NULLIF(TRIM(telefone), '')) IS NOT NULL
)
SELECT id, identificador_unico
FROM identificadores
WHERE rn = 1;

-- 2. Criar mapeamento de contatos duplicados para o contato a manter
CREATE TEMP TABLE mapeamento_duplicatas AS
WITH identificadores AS (
  SELECT 
    id,
    COALESCE(NULLIF(TRIM(cpf_cnpj), ''), NULLIF(TRIM(email), ''), NULLIF(TRIM(telefone), '')) as identificador_unico
  FROM crm_contatos
  WHERE COALESCE(NULLIF(TRIM(cpf_cnpj), ''), NULLIF(TRIM(email), ''), NULLIF(TRIM(telefone), '')) IS NOT NULL
)
SELECT 
  i.id as id_duplicata,
  m.id as id_manter
FROM identificadores i
JOIN contatos_a_manter m ON i.identificador_unico = m.identificador_unico
WHERE i.id != m.id;

-- 3. Atualizar propostas_assinantes para apontar para o contato correto
UPDATE propostas_assinantes pa
SET crm_contato_id = md.id_manter
FROM mapeamento_duplicatas md
WHERE pa.crm_contato_id = md.id_duplicata;

-- 4. Excluir contatos duplicados (as propostas já foram remapeadas)
DELETE FROM crm_contatos
WHERE id IN (SELECT id_duplicata FROM mapeamento_duplicatas);

-- 5. Limpar tabelas temporárias
DROP TABLE IF EXISTS contatos_a_manter;
DROP TABLE IF EXISTS mapeamento_duplicatas;

-- 6. Adicionar comentário na coluna deprecated
COMMENT ON COLUMN crm_contatos.proposta_id IS 'DEPRECATED: Usar propostas_assinantes.crm_contato_id para encontrar propostas de um contato';