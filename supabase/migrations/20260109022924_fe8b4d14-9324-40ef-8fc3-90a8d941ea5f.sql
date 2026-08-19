-- Adicionar colunas para regras fiscais da compensação GD
ALTER TABLE icms_estados 
ADD COLUMN IF NOT EXISTS icms_isenta_compensacao BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS base_legal TEXT,
ADD COLUMN IF NOT EXISTS observacoes_gd TEXT,
ADD COLUMN IF NOT EXISTS vigencia_ate DATE;

-- Popular dados com a matriz de estados confirmados
UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'RICMS/SP, Anexo I, art. 166',
  observacoes_gd = 'Não alcança disponibilidade, reativa, demanda, encargos de conexão/uso'
WHERE uf = 'SP';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'RICMS/BA (Decreto 13.780/2012)',
  observacoes_gd = 'Não se aplica a disponibilidade, reativa, demanda, encargos/uso do sistema'
WHERE uf = 'BA';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'Lei 7.122/15 e Resolução SEFAZ 969/2016',
  observacoes_gd = 'Vigência documentada até 17/12/2025',
  vigencia_ate = '2025-12-17'
WHERE uf = 'RJ';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'Lei SC 17.762/2019',
  observacoes_gd = 'Enquanto vigorar o Convênio ICMS 16/2015'
WHERE uf = 'SC';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'Decreto/SEFA-PR (Convênio 42/18)',
  observacoes_gd = 'Prazo máximo de fruição de 48 meses por UC'
WHERE uf = 'PR';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'RICMS/MG – Anexo X',
  observacoes_gd = 'Exclusões: disponibilidade, reativa, demanda, encargos'
WHERE uf = 'MG';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'Portal Receita/RS - RICMS/RS',
  observacoes_gd = NULL
WHERE uf = 'RS';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'RCTE/GO – Anexo de Benefícios Fiscais',
  observacoes_gd = NULL
WHERE uf = 'GO';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'SEFAZ-PE – Resolução de Consulta (RICMS/PE)',
  observacoes_gd = 'Exclusões: disponibilidade, reativa, demanda, encargos'
WHERE uf = 'PE';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'Decreto 24.569/97 (CE) - alterado em 16/12/2015',
  observacoes_gd = NULL
WHERE uf = 'CE';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'Parecer SEFAZ-ES (Convênio 16/2015)',
  observacoes_gd = NULL
WHERE uf = 'ES';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'SEFAZ/MA (regulamento oficial)',
  observacoes_gd = NULL
WHERE uf = 'MA';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'Decreto 14.617/2016',
  observacoes_gd = NULL
WHERE uf = 'MS';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'SEFAZ-MT (Convênio 16/2015)',
  observacoes_gd = NULL
WHERE uf = 'MT';

UPDATE icms_estados SET 
  icms_isenta_compensacao = true,
  base_legal = 'Portal Legis/AC (Lei/Regulamento)',
  observacoes_gd = NULL
WHERE uf = 'AC';

-- Estados sem informação clara ficam como false (conservador)
UPDATE icms_estados SET 
  icms_isenta_compensacao = false,
  observacoes_gd = 'Sem base legal clara identificada - tratamento conservador'
WHERE uf IN ('AL', 'AM', 'AP', 'DF', 'PA', 'PB', 'PI', 'RN', 'RO', 'RR', 'SE', 'TO')
  AND icms_isenta_compensacao IS NULL;