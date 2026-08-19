-- Adicionar colunas para registrar divergências detectadas e retificações
ALTER TABLE solicitacoes_proposta_definitiva 
ADD COLUMN IF NOT EXISTS divergencias_detectadas jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS dados_retificados boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS nome_retificado text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS concessionaria text DEFAULT NULL;