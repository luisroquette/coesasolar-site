-- Tabela de bandeiras tarifárias (histórico mensal)
CREATE TABLE public.bandeiras_tarifarias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ano_mes VARCHAR(7) NOT NULL, -- formato YYYY-MM
  bandeira VARCHAR(20) NOT NULL CHECK (bandeira IN ('verde', 'amarela', 'vermelha1', 'vermelha2')),
  valor_kwh NUMERIC(10, 5) NOT NULL, -- adicional em R$/kWh
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ano_mes)
);

-- Enable RLS
ALTER TABLE public.bandeiras_tarifarias ENABLE ROW LEVEL SECURITY;

-- Políticas: leitura pública, escrita apenas autenticados
CREATE POLICY "Bandeiras visíveis para todos" ON public.bandeiras_tarifarias 
  FOR SELECT USING (true);

CREATE POLICY "Usuários autenticados podem gerenciar bandeiras" ON public.bandeiras_tarifarias 
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Trigger para updated_at
CREATE TRIGGER update_bandeiras_updated_at
  BEFORE UPDATE ON public.bandeiras_tarifarias
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar campo TUSD Fio B na tabela de concessionárias
ALTER TABLE public.concessionarias 
  ADD COLUMN IF NOT EXISTS tusd_fio_b NUMERIC(10, 6);

-- Inserir valores atuais das bandeiras (ANEEL 2024/2025)
INSERT INTO public.bandeiras_tarifarias (ano_mes, bandeira, valor_kwh) VALUES
  ('2024-01', 'verde', 0),
  ('2024-02', 'verde', 0),
  ('2024-03', 'verde', 0),
  ('2024-04', 'verde', 0),
  ('2024-05', 'verde', 0),
  ('2024-06', 'verde', 0),
  ('2024-07', 'amarela', 0.01885),
  ('2024-08', 'verde', 0),
  ('2024-09', 'verde', 0),
  ('2024-10', 'vermelha2', 0.07877),
  ('2024-11', 'vermelha2', 0.07877),
  ('2024-12', 'vermelha2', 0.07877),
  ('2025-01', 'verde', 0),
  ('2025-02', 'verde', 0),
  ('2025-03', 'verde', 0),
  ('2025-04', 'verde', 0),
  ('2025-05', 'verde', 0),
  ('2025-06', 'verde', 0),
  ('2025-07', 'verde', 0),
  ('2025-08', 'verde', 0),
  ('2025-09', 'verde', 0),
  ('2025-10', 'verde', 0),
  ('2025-11', 'verde', 0),
  ('2025-12', 'verde', 0),
  ('2026-01', 'verde', 0)
ON CONFLICT (ano_mes) DO NOTHING;