-- ═══════════════════════════════════════════════════════════════
-- ETAPA 1: Tabela de Distribuidoras (migração de dados hardcoded)
-- Substitui: DISTRIBUIDORAS_ATENDIDAS, DISTRIBUIDORAS_GENERICAS, DISTRIBUIDORAS_NAO_ATENDIDAS
-- ═══════════════════════════════════════════════════════════════

-- Tabela principal de distribuidoras
CREATE TABLE public.distribuidoras_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  nome_normalizado TEXT NOT NULL UNIQUE,
  uf TEXT,
  is_atendida BOOLEAN DEFAULT false,
  requires_clarification BOOLEAN DEFAULT false,
  clarification_message TEXT,
  rejection_message TEXT,
  parent_id UUID REFERENCES public.distribuidoras_config(id),
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de typos/variações para reconhecimento
CREATE TABLE public.distribuidora_typos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribuidora_id UUID NOT NULL REFERENCES public.distribuidoras_config(id) ON DELETE CASCADE,
  typo TEXT NOT NULL,
  pattern_regex TEXT,
  is_confirmed BOOLEAN DEFAULT false,
  confirmation_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_distribuidoras_config_normalizado ON public.distribuidoras_config(nome_normalizado);
CREATE INDEX idx_distribuidoras_config_atendida ON public.distribuidoras_config(is_atendida) WHERE is_active = true;
CREATE INDEX idx_distribuidora_typos_typo ON public.distribuidora_typos(typo);
CREATE INDEX idx_distribuidora_typos_distribuidora ON public.distribuidora_typos(distribuidora_id);

-- Trigger para updated_at
CREATE TRIGGER update_distribuidoras_config_updated_at
  BEFORE UPDATE ON public.distribuidoras_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA: Distribuidoras Atendidas
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.distribuidoras_config (nome, nome_normalizado, uf, is_atendida, priority) VALUES
  ('CEMIG', 'CEMIG', 'MG', true, 100),
  ('Neoenergia Coelba', 'NEOENERGIA COELBA', 'BA', true, 100),
  ('CPFL Paulista', 'CPFL PAULISTA', 'SP', true, 100);

-- Alias para COELBA (mesmo registro)
INSERT INTO public.distribuidora_typos (distribuidora_id, typo, is_confirmed, confirmation_count)
SELECT id, 'COELBA', true, 999 FROM public.distribuidoras_config WHERE nome_normalizado = 'NEOENERGIA COELBA';

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA: Distribuidoras Genéricas (precisam clarificação)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.distribuidoras_config (nome, nome_normalizado, uf, is_atendida, requires_clarification, clarification_message, parent_id) VALUES
  ('Neoenergia', 'NEOENERGIA', NULL, false, true, 
   'Qual Neoenergia? Atendemos atualmente a *Neoenergia Coelba*, na Bahia. É essa a sua?',
   (SELECT id FROM public.distribuidoras_config WHERE nome_normalizado = 'NEOENERGIA COELBA')),
  ('CPFL', 'CPFL', NULL, false, true,
   'Qual CPFL? Existem várias pelo Brasil, mas atendemos apenas a *CPFL Paulista*. É essa a sua?',
   (SELECT id FROM public.distribuidoras_config WHERE nome_normalizado = 'CPFL PAULISTA'));

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA: Distribuidoras NÃO Atendidas
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.distribuidoras_config (nome, nome_normalizado, uf, is_atendida, rejection_message) VALUES
  ('Amazonas Energia', 'AMAZONAS ENERGIA', 'AM', false, NULL),
  ('CEA', 'CEA', 'AP', false, NULL),
  ('CELESC', 'CELESC', 'SC', false, NULL),
  ('Roraima Energia', 'RORAIMA', 'RR', false, NULL),
  ('CEEE', 'CEEE', 'RS', false, NULL),
  ('COPEL', 'COPEL', 'PR', false, NULL),
  ('CHESP', 'CHESP', 'GO', false, NULL),
  ('EDP', 'EDP', NULL, false, NULL),
  ('EDP Espírito Santo', 'EDP ESPIRITO SANTO', 'ES', false, NULL),
  ('EDP São Paulo', 'EDP SAO PAULO', 'SP', false, NULL),
  ('ENEL', 'ENEL', NULL, false, NULL),
  ('ENEL Ceará', 'ENEL CEARA', 'CE', false, NULL),
  ('ENEL Rio', 'ENEL RIO', 'RJ', false, NULL),
  ('ENEL São Paulo', 'ENEL SAO PAULO', 'SP', false, NULL),
  ('Energisa', 'ENERGISA', NULL, false, NULL),
  ('Energisa Acre', 'ENERGISA ACRE', 'AC', false, NULL),
  ('Energisa Borborema', 'ENERGISA BORBOREMA', 'PB', false, NULL),
  ('Energisa MT', 'ENERGISA MT', 'MT', false, NULL),
  ('Energisa MS', 'ENERGISA MS', 'MS', false, NULL),
  ('Energisa MG', 'ENERGISA MG', 'MG', false, NULL),
  ('Energisa Nova Friburgo', 'ENERGISA NOVA FRIBURGO', 'RJ', false, NULL),
  ('Energisa Rondônia', 'ENERGISA RONDONIA', 'RO', false, NULL),
  ('Energisa Sergipe', 'ENERGISA SERGIPE', 'SE', false, NULL),
  ('Energisa Sul-Sudeste', 'ENERGISA SUL-SUDESTE', NULL, false, NULL),
  ('Energisa Tocantins', 'ENERGISA TOCANTINS', 'TO', false, NULL),
  ('Equatorial', 'EQUATORIAL', NULL, false, NULL),
  ('Equatorial Alagoas', 'EQUATORIAL ALAGOAS', 'AL', false, NULL),
  ('Equatorial Goiás', 'EQUATORIAL GOIAS', 'GO', false, NULL),
  ('Equatorial Maranhão', 'EQUATORIAL MARANHAO', 'MA', false, NULL),
  ('Equatorial Pará', 'EQUATORIAL PARA', 'PA', false, NULL),
  ('Equatorial Piauí', 'EQUATORIAL PIAUI', 'PI', false, NULL),
  ('Light', 'LIGHT', 'RJ', false, NULL),
  ('Matrix Energia', 'MATRIX', NULL, false, NULL),
  ('Neoenergia Brasília', 'NEOENERGIA BRASILIA', 'DF', false, NULL),
  ('Neoenergia Cosern', 'NEOENERGIA COSERN', 'RN', false, NULL),
  ('Neoenergia Elektro', 'NEOENERGIA ELEKTRO', 'SP', false, NULL),
  ('Neoenergia Pernambuco', 'NEOENERGIA PERNAMBUCO', 'PE', false, NULL),
  ('RGE Sul', 'RGE SUL', 'RS', false, NULL),
  ('CELPE', 'CELPE', 'PE', false, NULL),
  ('Eletropaulo', 'ELETROPAULO', 'SP', false, NULL),
  ('Elektro', 'ELEKTRO', 'SP', false, NULL),
  ('Cosern', 'COSERN', 'RN', false, NULL);

-- Mensagem padrão de rejeição para todas que não têm mensagem específica
UPDATE public.distribuidoras_config 
SET rejection_message = 'Hmm... Sentimos muito, mas ainda não atendemos a sua região. 😔

A *' || nome || '* está no nosso plano de expansão e, em breve, estaremos por aí!

Posso salvar seu contato e te chamar quando iniciarmos as operações na sua área? 📋'
WHERE is_atendida = false AND rejection_message IS NULL AND requires_clarification = false;

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA: Typos comuns para distribuidoras atendidas
-- ═══════════════════════════════════════════════════════════════

-- CEMIG typos
INSERT INTO public.distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed, confirmation_count)
SELECT id, typo, NULL, false, 1 FROM public.distribuidoras_config, 
  (VALUES ('cemg'), ('ceming'), ('cemmig'), ('semig'), ('cmig'), ('cemigue')) AS t(typo)
WHERE nome_normalizado = 'CEMIG';

-- COELBA typos
INSERT INTO public.distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed, confirmation_count)
SELECT id, typo, NULL, false, 1 FROM public.distribuidoras_config,
  (VALUES ('colba'), ('coeba'), ('coelb'), ('coleba'), ('coelaba'), ('coelbe'), ('coelbo'), ('kolba'), ('coelpa')) AS t(typo)
WHERE nome_normalizado = 'NEOENERGIA COELBA';

-- CPFL PAULISTA typos
INSERT INTO public.distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed, confirmation_count)
SELECT id, typo, NULL, false, 1 FROM public.distribuidoras_config,
  (VALUES ('cfpl paulista'), ('cplf paulista'), ('cpffl paulista'), ('cpfl paulist')) AS t(typo)
WHERE nome_normalizado = 'CPFL PAULISTA';

-- CPFL genérico typos
INSERT INTO public.distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed, confirmation_count)
SELECT id, typo, NULL, false, 1 FROM public.distribuidoras_config,
  (VALUES ('cfpl'), ('cplf'), ('cpffl'), ('cpfll'), ('cppfl')) AS t(typo)
WHERE nome_normalizado = 'CPFL';

-- NEOENERGIA genérico typos
INSERT INTO public.distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed, confirmation_count)
SELECT id, typo, NULL, false, 1 FROM public.distribuidoras_config,
  (VALUES ('neoenrgia'), ('neoenergi'), ('neoengia'), ('neoenerja'), ('neoenergiaa')) AS t(typo)
WHERE nome_normalizado = 'NEOENERGIA';

-- Typos para distribuidoras não atendidas (para melhor reconhecimento)
INSERT INTO public.distribuidora_typos (distribuidora_id, typo, is_confirmed) 
SELECT id, typo, false FROM public.distribuidoras_config,
  (VALUES ('enell'), ('enal'), ('eneel'), ('enle'), ('elnel')) AS t(typo)
WHERE nome_normalizado = 'ENEL';

INSERT INTO public.distribuidora_typos (distribuidora_id, typo, is_confirmed)
SELECT id, typo, false FROM public.distribuidoras_config,
  (VALUES ('coppel'), ('copell'), ('copeel'), ('colpel'), ('kopel')) AS t(typo)
WHERE nome_normalizado = 'COPEL';

INSERT INTO public.distribuidora_typos (distribuidora_id, typo, is_confirmed)
SELECT id, typo, false FROM public.distribuidoras_config,
  (VALUES ('ligth'), ('lihgt'), ('lighr'), ('liht'), ('lightt'), ('laight'), ('lite')) AS t(typo)
WHERE nome_normalizado = 'LIGHT';

INSERT INTO public.distribuidora_typos (distribuidora_id, typo, is_confirmed)
SELECT id, typo, false FROM public.distribuidoras_config,
  (VALUES ('enrgisa'), ('energis'), ('energiza'), ('enerjisa'), ('enegisa')) AS t(typo)
WHERE nome_normalizado = 'ENERGISA';

INSERT INTO public.distribuidora_typos (distribuidora_id, typo, is_confirmed)
SELECT id, typo, false FROM public.distribuidoras_config,
  (VALUES ('ecuatorial'), ('equatoriaol'), ('equatorail'), ('ekuatorial'), ('equatoral')) AS t(typo)
WHERE nome_normalizado = 'EQUATORIAL';

INSERT INTO public.distribuidora_typos (distribuidora_id, typo, is_confirmed)
SELECT id, typo, false FROM public.distribuidoras_config,
  (VALUES ('celesk'), ('celsc'), ('celesce'), ('celessc'), ('selesc')) AS t(typo)
WHERE nome_normalizado = 'CELESC';

-- ═══════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.distribuidoras_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribuidora_typos ENABLE ROW LEVEL SECURITY;

-- Leitura pública (edge functions precisam ler)
CREATE POLICY "Distribuidoras are readable by authenticated users"
  ON public.distribuidoras_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Distribuidoras are readable by service role"
  ON public.distribuidoras_config FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Typos are readable by authenticated users"
  ON public.distribuidora_typos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Typos are readable by service role"
  ON public.distribuidora_typos FOR SELECT
  TO service_role
  USING (true);

-- Escrita apenas para admins
CREATE POLICY "Admins can manage distribuidoras"
  ON public.distribuidoras_config FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage typos"
  ON public.distribuidora_typos FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Service role tem acesso total (para edge functions)
CREATE POLICY "Service role can insert typos"
  ON public.distribuidora_typos FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update typos"
  ON public.distribuidora_typos FOR UPDATE
  TO service_role
  USING (true);

-- ═══════════════════════════════════════════════════════════════
-- FUNÇÃO HELPER para buscar distribuidora
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.find_distribuidora(p_input TEXT)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  nome_normalizado TEXT,
  uf TEXT,
  is_atendida BOOLEAN,
  requires_clarification BOOLEAN,
  clarification_message TEXT,
  rejection_message TEXT,
  parent_id UUID,
  matched_via TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := UPPER(TRIM(p_input));
  
  -- 1. Busca exata por nome_normalizado
  RETURN QUERY
  SELECT d.id, d.nome, d.nome_normalizado, d.uf, d.is_atendida,
         d.requires_clarification, d.clarification_message, d.rejection_message,
         d.parent_id, 'exact'::TEXT as matched_via
  FROM distribuidoras_config d
  WHERE d.nome_normalizado = v_normalized AND d.is_active = true
  LIMIT 1;
  
  IF FOUND THEN RETURN; END IF;
  
  -- 2. Busca por typo
  RETURN QUERY
  SELECT d.id, d.nome, d.nome_normalizado, d.uf, d.is_atendida,
         d.requires_clarification, d.clarification_message, d.rejection_message,
         d.parent_id, 'typo'::TEXT as matched_via
  FROM distribuidora_typos t
  JOIN distribuidoras_config d ON d.id = t.distribuidora_id
  WHERE LOWER(t.typo) = LOWER(p_input) AND d.is_active = true
  LIMIT 1;
  
  IF FOUND THEN RETURN; END IF;
  
  -- 3. Busca parcial (contém)
  RETURN QUERY
  SELECT d.id, d.nome, d.nome_normalizado, d.uf, d.is_atendida,
         d.requires_clarification, d.clarification_message, d.rejection_message,
         d.parent_id, 'partial'::TEXT as matched_via
  FROM distribuidoras_config d
  WHERE (d.nome_normalizado ILIKE '%' || v_normalized || '%' 
         OR v_normalized ILIKE '%' || d.nome_normalizado || '%')
        AND d.is_active = true
  ORDER BY d.priority DESC, LENGTH(d.nome_normalizado) DESC
  LIMIT 1;
  
END;
$$;