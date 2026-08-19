-- Add bitrix_value column to distribuidoras_config
ALTER TABLE distribuidoras_config
ADD COLUMN IF NOT EXISTS bitrix_value TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN distribuidoras_config.bitrix_value IS 'Exact value for Bitrix24 dropdown field';

-- Update distribuidoras with Bitrix values
UPDATE distribuidoras_config SET bitrix_value = 'CEMIG - MG' WHERE nome_normalizado = 'CEMIG';
UPDATE distribuidoras_config SET bitrix_value = 'COELBA - BA' WHERE nome_normalizado IN ('COELBA', 'NEOENERGIA COELBA');
UPDATE distribuidoras_config SET bitrix_value = 'CPFL Paulista - SP' WHERE nome_normalizado = 'CPFL PAULISTA';
UPDATE distribuidoras_config SET bitrix_value = 'ENEL - CE' WHERE nome_normalizado IN ('ENEL', 'ENEL CEARA');
UPDATE distribuidoras_config SET bitrix_value = 'COPEL - PR' WHERE nome_normalizado = 'COPEL';
UPDATE distribuidoras_config SET bitrix_value = 'CELESC - SC' WHERE nome_normalizado = 'CELESC';
UPDATE distribuidoras_config SET bitrix_value = 'CELPE - PE' WHERE nome_normalizado = 'CELPE';
UPDATE distribuidoras_config SET bitrix_value = 'COSERN - RN' WHERE nome_normalizado = 'COSERN';
UPDATE distribuidoras_config SET bitrix_value = 'ELEKTRO - SP' WHERE nome_normalizado = 'ELEKTRO';
UPDATE distribuidoras_config SET bitrix_value = 'ELETROPAULO - SP' WHERE nome_normalizado = 'ELETROPAULO';
UPDATE distribuidoras_config SET bitrix_value = 'ENEL RIO - RJ' WHERE nome_normalizado = 'ENEL RIO';
UPDATE distribuidoras_config SET bitrix_value = 'ENEL SAO PAULO - SP' WHERE nome_normalizado = 'ENEL SAO PAULO';
UPDATE distribuidoras_config SET bitrix_value = 'EDP ES - ES' WHERE nome_normalizado = 'EDP ESPIRITO SANTO';
UPDATE distribuidoras_config SET bitrix_value = 'EDP SP - SP' WHERE nome_normalizado = 'EDP SAO PAULO';
UPDATE distribuidoras_config SET bitrix_value = 'ENERGISA MG - MG' WHERE nome_normalizado = 'ENERGISA MG';
UPDATE distribuidoras_config SET bitrix_value = 'ENERGISA MS - MS' WHERE nome_normalizado = 'ENERGISA MS';
UPDATE distribuidoras_config SET bitrix_value = 'ENERGISA MT - MT' WHERE nome_normalizado = 'ENERGISA MT';

-- Set default bitrix_value for remaining distribuidoras (use nome + UF format)
UPDATE distribuidoras_config 
SET bitrix_value = nome_normalizado || COALESCE(' - ' || uf, '')
WHERE bitrix_value IS NULL AND is_active = true;