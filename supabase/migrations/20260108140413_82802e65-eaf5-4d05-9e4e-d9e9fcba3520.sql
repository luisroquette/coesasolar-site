-- Atualizar valores padrão da tabela propostas_assinantes
ALTER TABLE propostas_assinantes 
  ALTER COLUMN cip SET DEFAULT 45,
  ALTER COLUMN desconto_percentual SET DEFAULT 25,
  ALTER COLUMN fidelidade_anos SET DEFAULT 3;