-- Adicionar campo pis_cofins na tabela concessionarias
ALTER TABLE public.concessionarias 
ADD COLUMN IF NOT EXISTS pis_cofins numeric DEFAULT 0.0365;

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.concessionarias.pis_cofins IS 'Alíquota PIS/COFINS da concessionária (ex: 0.0553 para 5,53%)';

-- Inserir configuração de taxa bancária COESA se não existir
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES ('taxa_bancaria_coesa', '4.50', 'Taxa bancária cobrada pela COESA em cada fatura (R$)')
ON CONFLICT (chave) DO NOTHING;

-- Inserir configuração de tarifa padrão COESA se não existir
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES ('tarifa_padrao_coesa', '0.80', 'Tarifa padrão cobrada pela COESA por kWh (R$/kWh)')
ON CONFLICT (chave) DO NOTHING;