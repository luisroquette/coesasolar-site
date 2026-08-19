-- Consolidar duplicatas por TELEFONE (normalizado)
-- Mantém o registro com mais dados (CPF/CNPJ preferido) ou o mais antigo

-- Primeiro, criar tabela temporária com mapeamento de duplicatas
CREATE TEMP TABLE telefone_duplicatas AS
SELECT 
  id,
  nome,
  telefone,
  REGEXP_REPLACE(telefone, '[^0-9]', '', 'g') as tel_norm,
  cpf_cnpj,
  email,
  created_at,
  ROW_NUMBER() OVER (
    PARTITION BY REGEXP_REPLACE(telefone, '[^0-9]', '', 'g')
    ORDER BY 
      CASE WHEN cpf_cnpj IS NOT NULL AND TRIM(cpf_cnpj) != '' THEN 0 ELSE 1 END,
      CASE WHEN email IS NOT NULL AND TRIM(email) != '' THEN 0 ELSE 1 END,
      created_at ASC
  ) as rn
FROM crm_contatos
WHERE telefone IS NOT NULL 
  AND TRIM(telefone) != ''
  AND LENGTH(REGEXP_REPLACE(telefone, '[^0-9]', '', 'g')) >= 8;

-- Tabela com IDs a manter (rn = 1)
CREATE TEMP TABLE manter AS
SELECT id, tel_norm FROM telefone_duplicatas WHERE rn = 1;

-- Tabela com mapeamento de remoção
CREATE TEMP TABLE remover AS
SELECT d.id as id_remover, m.id as id_manter
FROM telefone_duplicatas d
JOIN manter m ON d.tel_norm = m.tel_norm
WHERE d.rn > 1;

-- 1. Atualizar propostas para apontar para contato mantido
UPDATE propostas_assinantes pa
SET crm_contato_id = r.id_manter
FROM remover r
WHERE pa.crm_contato_id = r.id_remover;

-- 2. Excluir duplicatas
DELETE FROM crm_contatos
WHERE id IN (SELECT id_remover FROM remover);

-- Limpar tabelas temporárias
DROP TABLE IF EXISTS telefone_duplicatas;
DROP TABLE IF EXISTS manter;
DROP TABLE IF EXISTS remover;