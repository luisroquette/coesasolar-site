-- Create unique index on bitrix24_lead_id to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_propostas_assinantes_bitrix24_lead_id_unique 
ON propostas_assinantes(bitrix24_lead_id) 
WHERE bitrix24_lead_id IS NOT NULL;