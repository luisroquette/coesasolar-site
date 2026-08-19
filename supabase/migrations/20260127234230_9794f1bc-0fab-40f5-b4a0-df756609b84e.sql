-- Tabela para armazenar o cronograma de transição GD2 (Lei 14.300)
-- Substitui os valores hardcoded em src/lib/calculations.ts

CREATE TABLE public.cronograma_gd2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INTEGER NOT NULL UNIQUE,
  percentual DECIMAL(5,4) NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir dados atuais (antes hardcoded)
INSERT INTO public.cronograma_gd2 (ano, percentual, descricao) VALUES
  (2023, 0.0000, 'Isenção total'),
  (2024, 0.1500, '15% da TUSD Fio B'),
  (2025, 0.3000, '30% da TUSD Fio B'),
  (2026, 0.4500, '45% da TUSD Fio B'),
  (2027, 0.6000, '60% da TUSD Fio B'),
  (2028, 0.7500, '75% da TUSD Fio B'),
  (2029, 0.9000, '90% da TUSD Fio B');

-- RLS: Apenas admins podem modificar
ALTER TABLE public.cronograma_gd2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage cronograma_gd2"
  ON public.cronograma_gd2
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read cronograma_gd2"
  ON public.cronograma_gd2
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_cronograma_gd2_updated_at
  BEFORE UPDATE ON public.cronograma_gd2
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();