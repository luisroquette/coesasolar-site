-- Adicionar campos para Proposta Cliente com GD
ALTER TABLE propostas_assinantes ADD COLUMN IF NOT EXISTS 
  tipo_proposta_sub TEXT DEFAULT NULL;

ALTER TABLE propostas_assinantes ADD COLUMN IF NOT EXISTS 
  nome_concorrente TEXT;

ALTER TABLE propostas_assinantes ADD COLUMN IF NOT EXISTS 
  desconto_concorrente NUMERIC(5,2);

ALTER TABLE propostas_assinantes ADD COLUMN IF NOT EXISTS 
  multa_rescisoria NUMERIC(12,2);

ALTER TABLE propostas_assinantes ADD COLUMN IF NOT EXISTS 
  meses_restantes_concorrente INTEGER;

ALTER TABLE propostas_assinantes ADD COLUMN IF NOT EXISTS 
  payback_multa_meses NUMERIC(5,1);

ALTER TABLE propostas_assinantes ADD COLUMN IF NOT EXISTS 
  economia_adicional_mensal NUMERIC(12,2);

-- Comentários para documentação
COMMENT ON COLUMN propostas_assinantes.tipo_proposta_sub IS 'Subtipo da proposta: cliente_gd para migração de concorrentes';
COMMENT ON COLUMN propostas_assinantes.nome_concorrente IS 'Nome do consórcio/cooperativa concorrente atual';
COMMENT ON COLUMN propostas_assinantes.desconto_concorrente IS 'Percentual de desconto oferecido pelo concorrente';
COMMENT ON COLUMN propostas_assinantes.multa_rescisoria IS 'Valor da multa rescisória do contrato atual em R$';
COMMENT ON COLUMN propostas_assinantes.meses_restantes_concorrente IS 'Meses restantes do contrato com o concorrente';
COMMENT ON COLUMN propostas_assinantes.payback_multa_meses IS 'Tempo em meses para recuperar o valor da multa';
COMMENT ON COLUMN propostas_assinantes.economia_adicional_mensal IS 'Economia adicional mensal comparado ao concorrente';