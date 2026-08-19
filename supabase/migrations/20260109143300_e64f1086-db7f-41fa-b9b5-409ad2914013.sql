-- Adicionar configurações para Proposta Inicial no Bitrix24
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES 
  ('bitrix24_target_status_id_inicial', '', 'ID da coluna do Kanban para Proposta Inicial (simplificada)'),
  ('bitrix24_field_valor_conta', '', 'ID do campo customizado "Valor da Conta de Luz" no Bitrix24 (ex: UF_CRM_1234567)')
ON CONFLICT (chave) DO UPDATE SET descricao = EXCLUDED.descricao;

-- Adicionar coluna tipo_proposta na tabela propostas_assinantes
ALTER TABLE public.propostas_assinantes 
ADD COLUMN IF NOT EXISTS tipo_proposta TEXT DEFAULT 'definitiva' CHECK (tipo_proposta IN ('inicial', 'definitiva'));

-- Adicionar coluna para armazenar valor original da conta (para propostas iniciais)
ALTER TABLE public.propostas_assinantes 
ADD COLUMN IF NOT EXISTS valor_conta_original NUMERIC;

-- Adicionar coluna para indicar se dados foram inferidos
ALTER TABLE public.propostas_assinantes 
ADD COLUMN IF NOT EXISTS dados_inferidos BOOLEAN DEFAULT false;

-- Comentários para documentação
COMMENT ON COLUMN public.propostas_assinantes.tipo_proposta IS 'Tipo de proposta: inicial (simplificada, dados inferidos) ou definitiva (dados completos)';
COMMENT ON COLUMN public.propostas_assinantes.valor_conta_original IS 'Valor original da conta de luz informado pelo cliente (para propostas iniciais)';
COMMENT ON COLUMN public.propostas_assinantes.dados_inferidos IS 'Indica se consumo e tipo de instalação foram inferidos a partir do valor da conta';