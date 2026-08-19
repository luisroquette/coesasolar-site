-- Criar tabela de ICMS por estado
CREATE TABLE public.icms_estados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  uf VARCHAR(2) NOT NULL UNIQUE,
  nome_estado VARCHAR(100) NOT NULL,
  icms_percentual DECIMAL(5,2) NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.icms_estados ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública (dados de referência)
CREATE POLICY "ICMS estados são visíveis para todos autenticados" 
ON public.icms_estados 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Política de escrita apenas para admins
CREATE POLICY "Apenas admins podem modificar ICMS estados" 
ON public.icms_estados 
FOR ALL 
USING (public.is_admin(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_icms_estados_updated_at
BEFORE UPDATE ON public.icms_estados
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir dados iniciais de ICMS por estado (2025)
INSERT INTO public.icms_estados (uf, nome_estado, icms_percentual, observacoes) VALUES
('AC', 'Acre', 17.00, NULL),
('AL', 'Alagoas', 18.00, NULL),
('AP', 'Amapá', 17.00, NULL),
('AM', 'Amazonas', 18.00, NULL),
('BA', 'Bahia', 18.00, NULL),
('CE', 'Ceará', 18.00, NULL),
('DF', 'Distrito Federal', 18.00, NULL),
('ES', 'Espírito Santo', 17.00, NULL),
('GO', 'Goiás', 17.00, NULL),
('MA', 'Maranhão', 22.00, NULL),
('MT', 'Mato Grosso', 17.00, NULL),
('MS', 'Mato Grosso do Sul', 17.00, NULL),
('MG', 'Minas Gerais', 18.00, NULL),
('PA', 'Pará', 17.00, NULL),
('PB', 'Paraíba', 18.00, NULL),
('PR', 'Paraná', 18.00, NULL),
('PE', 'Pernambuco', 18.00, NULL),
('PI', 'Piauí', 18.00, NULL),
('RJ', 'Rio de Janeiro', 18.00, NULL),
('RN', 'Rio Grande do Norte', 18.00, NULL),
('RS', 'Rio Grande do Sul', 30.00, 'Faixas por consumo podem aplicar'),
('RO', 'Rondônia', 17.50, NULL),
('RR', 'Roraima', 17.00, NULL),
('SC', 'Santa Catarina', 25.00, 'Faixas por consumo podem aplicar'),
('SP', 'São Paulo', 18.00, NULL),
('SE', 'Sergipe', 18.00, NULL),
('TO', 'Tocantins', 18.00, NULL);

-- Adicionar coluna tarifa_com_impostos na tabela concessionarias
ALTER TABLE public.concessionarias 
ADD COLUMN IF NOT EXISTS tarifa_com_impostos DECIMAL(10,6);

-- Comentário explicativo
COMMENT ON COLUMN public.concessionarias.tarifa_com_impostos IS 'Tarifa calculada com PIS/COFINS e ICMS: (TE+TUSD)/(1-0.0365)*(1+ICMS)';