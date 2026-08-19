-- Adicionar colunas para features e faixa de consumo na tabela planos_comerciais
ALTER TABLE public.planos_comerciais 
ADD COLUMN IF NOT EXISTS consumo_range TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS features TEXT[] DEFAULT ARRAY['Energia 100% solar', 'Sem taxa de adesão', 'Contrato digital'];

-- Atualizar planos existentes com valores padrão
UPDATE public.planos_comerciais SET 
  consumo_range = 'Até 300 kWh/mês',
  features = ARRAY['Energia 100% solar', 'Sem taxa de adesão', 'Contrato digital']
WHERE nome = 'Plano Flex';

UPDATE public.planos_comerciais SET 
  consumo_range = '301 a 1.000 kWh/mês',
  features = ARRAY['Energia 100% solar', 'Sem taxa de adesão', 'Contrato digital', 'Atendimento prioritário']
WHERE nome = 'Plano Economia';

UPDATE public.planos_comerciais SET 
  consumo_range = '1.001 a 3.000 kWh/mês',
  features = ARRAY['Energia 100% solar', 'Sem taxa de adesão', 'Contrato digital', 'Gestor dedicado']
WHERE nome = 'Plano Premium';

UPDATE public.planos_comerciais SET 
  consumo_range = 'Acima de 3.000 kWh/mês',
  features = ARRAY['Energia 100% solar', 'Sem taxa de adesão', 'Contrato digital', 'Atendimento VIP']
WHERE nome = 'Plano UNLOCK';