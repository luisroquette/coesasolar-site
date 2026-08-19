-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: Migrate hardcoded DISTRIBUIDORA_PATTERNS and FORBIDDEN_TYPOS to database
-- Removes ~140 lines from sofia-webhook/index.ts
-- ═══════════════════════════════════════════════════════════════

-- 1. Create forbidden_typo_words table for words that should never be learned as distributor typos
CREATE TABLE IF NOT EXISTS public.forbidden_typo_words (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  word TEXT NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.forbidden_typo_words ENABLE ROW LEVEL SECURITY;

-- Allow read access for service role (edge functions)
CREATE POLICY "Service role can read forbidden words" 
ON public.forbidden_typo_words 
FOR SELECT 
USING (true);

-- Insert all forbidden words from the hardcoded constant
INSERT INTO public.forbidden_typo_words (word, reason) VALUES
  ('energia', 'generic_energy_term'),
  ('ener', 'substring_energia'),
  ('energ', 'substring_energia'),
  ('energi', 'substring_energia'),
  ('solar', 'generic_energy_term'),
  ('conta', 'billing_term'),
  ('luz', 'generic_energy_term'),
  ('coesa', 'company_name'),
  ('desconto', 'sales_term'),
  ('economizar', 'sales_term'),
  ('economiza', 'sales_term'),
  ('economia', 'sales_term'),
  ('tarifa', 'billing_term'),
  ('consumo', 'billing_term'),
  ('kwh', 'unit'),
  ('watt', 'unit'),
  ('eletrica', 'generic_energy_term'),
  ('eletricidade', 'generic_energy_term'),
  ('distribuidora', 'generic_term'),
  ('concessionaria', 'generic_term'),
  ('fatura', 'billing_term'),
  ('boleto', 'billing_term'),
  ('pagar', 'payment_term'),
  ('pagamento', 'payment_term'),
  ('reais', 'currency'),
  ('mensal', 'time_term'),
  ('mes', 'time_term'),
  ('ano', 'time_term'),
  ('casa', 'location_term'),
  ('empresa', 'location_term'),
  ('negocio', 'location_term'),
  ('comercio', 'location_term'),
  ('industria', 'location_term'),
  ('residencia', 'location_term'),
  ('apartamento', 'location_term'),
  ('site', 'generic_term'),
  ('internet', 'generic_term'),
  ('whatsapp', 'generic_term'),
  ('zap', 'generic_term'),
  ('ola', 'greeting'),
  ('oi', 'greeting'),
  ('bom', 'greeting'),
  ('dia', 'greeting'),
  ('tarde', 'greeting'),
  ('noite', 'greeting')
ON CONFLICT (word) DO NOTHING;

-- 2. Insert distributor typos from hardcoded DISTRIBUIDORA_PATTERNS
-- First, get the distribuidora IDs
DO $$
DECLARE
  cemig_id UUID;
  cpfl_id UUID;
  coelba_id UUID;
  neoenergia_id UUID;
  enel_id UUID;
  copel_id UUID;
  celesc_id UUID;
  light_id UUID;
  energisa_id UUID;
  equatorial_id UUID;
  elektro_id UUID;
  celpe_id UUID;
  cosern_id UUID;
  eletropaulo_id UUID;
  edp_id UUID;
  rge_id UUID;
  ceee_id UUID;
BEGIN
  -- Get IDs for each distributor
  SELECT id INTO cemig_id FROM distribuidoras_config WHERE nome_normalizado = 'CEMIG' LIMIT 1;
  SELECT id INTO cpfl_id FROM distribuidoras_config WHERE nome_normalizado = 'CPFL' LIMIT 1;
  SELECT id INTO coelba_id FROM distribuidoras_config WHERE nome_normalizado LIKE '%COELBA%' LIMIT 1;
  SELECT id INTO neoenergia_id FROM distribuidoras_config WHERE nome_normalizado = 'NEOENERGIA' LIMIT 1;
  SELECT id INTO enel_id FROM distribuidoras_config WHERE nome_normalizado = 'ENEL' LIMIT 1;
  SELECT id INTO copel_id FROM distribuidoras_config WHERE nome_normalizado = 'COPEL' LIMIT 1;
  SELECT id INTO celesc_id FROM distribuidoras_config WHERE nome_normalizado = 'CELESC' LIMIT 1;
  SELECT id INTO light_id FROM distribuidoras_config WHERE nome_normalizado = 'LIGHT' LIMIT 1;
  SELECT id INTO energisa_id FROM distribuidoras_config WHERE nome_normalizado = 'ENERGISA' LIMIT 1;
  SELECT id INTO equatorial_id FROM distribuidoras_config WHERE nome_normalizado = 'EQUATORIAL' LIMIT 1;
  SELECT id INTO elektro_id FROM distribuidoras_config WHERE nome_normalizado = 'ELEKTRO' LIMIT 1;
  SELECT id INTO celpe_id FROM distribuidoras_config WHERE nome_normalizado = 'CELPE' LIMIT 1;
  SELECT id INTO cosern_id FROM distribuidoras_config WHERE nome_normalizado = 'COSERN' LIMIT 1;
  SELECT id INTO eletropaulo_id FROM distribuidoras_config WHERE nome_normalizado = 'ELETROPAULO' LIMIT 1;
  SELECT id INTO edp_id FROM distribuidoras_config WHERE nome_normalizado = 'EDP' LIMIT 1;
  SELECT id INTO rge_id FROM distribuidoras_config WHERE nome_normalizado = 'RGE SUL' LIMIT 1;
  SELECT id INTO ceee_id FROM distribuidoras_config WHERE nome_normalizado = 'CEEE' LIMIT 1;

  -- Insert CEMIG typos
  IF cemig_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (cemig_id, 'cmeig', '\bcmeig\b', true),
      (cemig_id, 'semig', '\bsemig\b', true),
      (cemig_id, 'cemi', '\bcemi\b', true),
      (cemig_id, 'cemeg', '\bcemeg\b', true),
      (cemig_id, 'cemg', '\bcemg\b', true),
      (cemig_id, 'cmig', '\bcmig\b', true),
      (cemig_id, 'cemmig', '\bcemmig\b', true),
      (cemig_id, 'cemigi', '\bcemigi\b', true),
      (cemig_id, 'semmig', '\bsemmig\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert COELBA typos
  IF coelba_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (coelba_id, 'colba', '\bcolba\b', true),
      (coelba_id, 'coeba', '\bcoeba\b', true),
      (coelba_id, 'coelb', '\bcoelb\b', true),
      (coelba_id, 'coleba', '\bcoleba\b', true),
      (coelba_id, 'coelaba', '\bcoelaba\b', true),
      (coelba_id, 'coelbe', '\bcoelbe\b', true),
      (coelba_id, 'coelbo', '\bcoelbo\b', true),
      (coelba_id, 'kolba', '\bkolba\b', true),
      (coelba_id, 'coelpa', '\bcoelpa\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert NEOENERGIA typos
  IF neoenergia_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (neoenergia_id, 'neoenrgia', '\bneoenrgia\b', true),
      (neoenergia_id, 'neoenergi', '\bneoenergi\b', true),
      (neoenergia_id, 'neoengia', '\bneoengia\b', true),
      (neoenergia_id, 'neoenerja', '\bneoenerja\b', true),
      (neoenergia_id, 'neoenergiaa', '\bneoenergiaa\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert CPFL typos
  IF cpfl_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (cpfl_id, 'cfpl', '\bcfpl\b', true),
      (cpfl_id, 'cplf', '\bcplf\b', true),
      (cpfl_id, 'cpffl', '\bcpffl\b', true),
      (cpfl_id, 'cpfll', '\bcpfll\b', true),
      (cpfl_id, 'cppfl', '\bcppfl\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert ENEL typos
  IF enel_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (enel_id, 'enell', '\benell\b', true),
      (enel_id, 'enal', '\benal\b', true),
      (enel_id, 'eneel', '\beneel\b', true),
      (enel_id, 'enle', '\benle\b', true),
      (enel_id, 'elnel', '\belnel\b', true),
      (enel_id, 'ene', '\bene\b', true),
      (enel_id, 'enl', '\benl\b', true),
      (enel_id, 'eneli', '\beneli\b', true),
      (enel_id, 'ennell', '\bennell\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert COPEL typos
  IF copel_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (copel_id, 'coppel', '\bcoppel\b', true),
      (copel_id, 'copell', '\bcopell\b', true),
      (copel_id, 'copeel', '\bcopeel\b', true),
      (copel_id, 'colpel', '\bcolpel\b', true),
      (copel_id, 'copep', '\bcopep\b', true),
      (copel_id, 'kopel', '\bkopel\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert CELESC typos
  IF celesc_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (celesc_id, 'celesk', '\bcelesk\b', true),
      (celesc_id, 'celsc', '\bcelsc\b', true),
      (celesc_id, 'celesce', '\bcelesce\b', true),
      (celesc_id, 'celessc', '\bcelessc\b', true),
      (celesc_id, 'selesc', '\bselesc\b', true),
      (celesc_id, 'celec', '\bcelec\b', true),
      (celesc_id, 'selesk', '\bselesk\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert LIGHT typos
  IF light_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (light_id, 'ligth', '\bligth\b', true),
      (light_id, 'lihgt', '\blihgt\b', true),
      (light_id, 'lighr', '\blighr\b', true),
      (light_id, 'liht', '\bliht\b', true),
      (light_id, 'ligh', '\bligh\b', true),
      (light_id, 'lightt', '\blightt\b', true),
      (light_id, 'laight', '\blaight\b', true),
      (light_id, 'lite', '\blite\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert ENERGISA typos
  IF energisa_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (energisa_id, 'enrgisa', '\benrgisa\b', true),
      (energisa_id, 'energis', '\benergis\b', true),
      (energisa_id, 'energiza', '\benergiza\b', true),
      (energisa_id, 'enerjisa', '\benerjisa\b', true),
      (energisa_id, 'energissa', '\benergissa\b', true),
      (energisa_id, 'enrgiza', '\benrgiza\b', true),
      (energisa_id, 'enegisa', '\benegisa\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert EQUATORIAL typos
  IF equatorial_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (equatorial_id, 'ecuatorial', '\becuatorial\b', true),
      (equatorial_id, 'equatoriaol', '\bequatoriaol\b', true),
      (equatorial_id, 'equatorail', '\bequatorail\b', true),
      (equatorial_id, 'ekuatorial', '\bekuatorial\b', true),
      (equatorial_id, 'equatoreal', '\bequatoreal\b', true),
      (equatorial_id, 'equatoral', '\bequatoral\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert ELEKTRO typos
  IF elektro_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (elektro_id, 'eletro', '\beletro\b', true),
      (elektro_id, 'electro', '\belectro\b', true),
      (elektro_id, 'eleckro', '\beleckro\b', true),
      (elektro_id, 'elkero', '\belkero\b', true),
      (elektro_id, 'elektr', '\belektr\b', true),
      (elektro_id, 'elketro', '\belketro\b', true),
      (elektro_id, 'eletrko', '\beletrko\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert CELPE typos
  IF celpe_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (celpe_id, 'celp', '\bcelp\b', true),
      (celpe_id, 'celpee', '\bcelpee\b', true),
      (celpe_id, 'celep', '\bcelep\b', true),
      (celpe_id, 'celepe', '\bcelepe\b', true),
      (celpe_id, 'celpae', '\bcelpae\b', true),
      (celpe_id, 'selpe', '\bselpe\b', true),
      (celpe_id, 'cepel', '\bcepel\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert COSERN typos
  IF cosern_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (cosern_id, 'cossern', '\bcossern\b', true),
      (cosern_id, 'coserm', '\bcoserm\b', true),
      (cosern_id, 'cosren', '\bcosren\b', true),
      (cosern_id, 'cozern', '\bcozern\b', true),
      (cosern_id, 'cosenr', '\bcosenr\b', true),
      (cosern_id, 'cossren', '\bcossren\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert ELETROPAULO typos
  IF eletropaulo_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (eletropaulo_id, 'eletroplau', '\beletroplau\b', true),
      (eletropaulo_id, 'eletropaulp', '\beletropaulp\b', true),
      (eletropaulo_id, 'letropaulo', '\bletropaulo\b', true),
      (eletropaulo_id, 'eletropaluo', '\beletropaluo\b', true),
      (eletropaulo_id, 'eletorpaulo', '\beletorpaulo\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert EDP typos
  IF edp_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (edp_id, 'epd', '\bepd\b', true),
      (edp_id, 'edpp', '\bedpp\b', true),
      (edp_id, 'edpe', '\bedpe\b', true),
      (edp_id, 'eddp', '\beddp\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert RGE SUL typos
  IF rge_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (rge_id, 'rgesul', '\brgesul\b', true),
      (rge_id, 'rgel', '\brgel\b', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert CEEE typos
  IF ceee_id IS NOT NULL THEN
    INSERT INTO distribuidora_typos (distribuidora_id, typo, pattern_regex, is_confirmed) VALUES
      (ceee_id, 'cee', '\bcee\b', true),
      (ceee_id, 'ceeee', '\bceeee\b', true),
      (ceee_id, 'ceei', '\bceei\b', true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;