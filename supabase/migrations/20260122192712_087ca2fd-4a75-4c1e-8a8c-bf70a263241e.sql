-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: Insert hardcoded patterns into sofia_detection_patterns
-- Categories: billing_education_*, disqualification_*
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- BILLING EDUCATION: CIP
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES
  ('billing_education_cip', 'cosip', 'keyword', 'Contribuição de iluminação pública', 10, true),
  ('billing_education_cip', '\bcip\b', 'regex', 'CIP word boundary', 10, true),
  ('billing_education_cip', 'ilumina[çc][aã]o\s*p[uú]blica', 'regex', 'Iluminação pública', 10, true),
  ('billing_education_cip', 'contribui[çc][aã]o.*p[uú]blica', 'regex', 'Contribuição pública', 10, true),
  ('billing_education_cip', 'ilumina[çc][aã]o.*poste', 'regex', 'Iluminação poste', 10, true),
  ('billing_education_cip', 'poste.*luz', 'regex', 'Poste luz', 10, true),
  ('billing_education_cip', 'luz.*rua', 'regex', 'Luz rua', 10, true),
  ('billing_education_cip', 'taxa.*prefeitura', 'regex', 'Taxa prefeitura', 10, true),
  ('billing_education_cip', 'imposto.*municipal', 'regex', 'Imposto municipal', 10, true)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- BILLING EDUCATION: DISPONIBILIDADE
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES
  ('billing_education_disponibilidade', 'taxa.*m[ií]nim[ao]', 'regex', 'Taxa mínima', 10, true),
  ('billing_education_disponibilidade', 'valor.*m[ií]nim[ao]', 'regex', 'Valor mínimo', 10, true),
  ('billing_education_disponibilidade', 'custo.*m[ií]nim[ao]', 'regex', 'Custo mínimo', 10, true),
  ('billing_education_disponibilidade', 'disponibilidade', 'keyword', 'Disponibilidade', 10, true),
  ('billing_education_disponibilidade', 'custo.*fixo', 'regex', 'Custo fixo', 10, true),
  ('billing_education_disponibilidade', '30\s*kwh', 'regex', '30 kWh mínimo', 10, true),
  ('billing_education_disponibilidade', '50\s*kwh', 'regex', '50 kWh mínimo', 10, true),
  ('billing_education_disponibilidade', '100\s*kwh', 'regex', '100 kWh mínimo', 10, true),
  ('billing_education_disponibilidade', 'm[ií]nim[ao].*bif[aá]sic', 'regex', 'Mínimo bifásico', 10, true),
  ('billing_education_disponibilidade', 'm[ií]nim[ao].*trif[aá]sic', 'regex', 'Mínimo trifásico', 10, true),
  ('billing_education_disponibilidade', 'm[ií]nim[ao].*monof[aá]sic', 'regex', 'Mínimo monofásico', 10, true),
  ('billing_education_disponibilidade', 'bifasico|trifasico|monofasico', 'regex', 'Tipo instalação', 10, true),
  ('billing_education_disponibilidade', 'taxa.*rede', 'regex', 'Taxa rede', 10, true),
  ('billing_education_disponibilidade', 'custo.*rede', 'regex', 'Custo rede', 10, true),
  ('billing_education_disponibilidade', 'infraestrutura.*el[eé]trica', 'regex', 'Infraestrutura elétrica', 10, true)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- BILLING EDUCATION: DESCONTO BASE
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES
  ('billing_education_desconto_base', 'desconto.*incide', 'regex', 'Desconto incide', 10, true),
  ('billing_education_desconto_base', 'desconto.*aplica', 'regex', 'Desconto aplica', 10, true),
  ('billing_education_desconto_base', 'sobre.*o.*que.*aplica', 'regex', 'Sobre o que aplica', 10, true),
  ('billing_education_desconto_base', 'sobre.*consumo', 'regex', 'Sobre consumo', 10, true),
  ('billing_education_desconto_base', 'consumo.*desconto', 'regex', 'Consumo desconto', 10, true),
  ('billing_education_desconto_base', 'inclui.*c[aá]lculo', 'regex', 'Inclui cálculo', 10, true),
  ('billing_education_desconto_base', 'entra.*no.*c[aá]lculo', 'regex', 'Entra no cálculo', 10, true),
  ('billing_education_desconto_base', '25%.*total', 'regex', '25% total', 10, true),
  ('billing_education_desconto_base', 'total.*25%', 'regex', 'Total 25%', 10, true),
  ('billing_education_desconto_base', '\d+%.*total', 'regex', 'Percentual total', 10, true),
  ('billing_education_desconto_base', 'total.*\d+%', 'regex', 'Total percentual', 10, true),
  ('billing_education_desconto_base', 'desconto.*total.*fatura', 'regex', 'Desconto total fatura', 10, true),
  ('billing_education_desconto_base', 'fatura.*toda', 'regex', 'Fatura toda', 10, true),
  ('billing_education_desconto_base', 'conta.*toda', 'regex', 'Conta toda', 10, true),
  ('billing_education_desconto_base', 'tudo.*desconto', 'regex', 'Tudo desconto', 10, true),
  ('billing_education_desconto_base', 'compensa.*esses.*valores', 'regex', 'Compensa valores', 10, true),
  ('billing_education_desconto_base', 'n[aã]o.*compensa', 'regex', 'Não compensa', 10, true),
  ('billing_education_desconto_base', 'por.*que.*n[aã]o.*zera', 'regex', 'Por que não zera', 10, true),
  ('billing_education_desconto_base', 'conta.*n[aã]o.*zera', 'regex', 'Conta não zera', 10, true),
  ('billing_education_desconto_base', 'fatura.*n[aã]o.*zera', 'regex', 'Fatura não zera', 10, true)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- BILLING EDUCATION: COMPARATIVO
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES
  ('billing_education_comparativo', 'nenhuma.*empresa', 'regex', 'Nenhuma empresa', 10, true),
  ('billing_education_comparativo', 'concorr[eê]ncia', 'regex', 'Concorrência', 10, true),
  ('billing_education_comparativo', 'outra.*empresa', 'regex', 'Outra empresa', 10, true),
  ('billing_education_comparativo', 'outras.*empresas', 'regex', 'Outras empresas', 10, true),
  ('billing_education_comparativo', 'diferente.*de', 'regex', 'Diferente de', 10, true),
  ('billing_education_comparativo', 'melhor.*que', 'regex', 'Melhor que', 10, true),
  ('billing_education_comparativo', 'pior.*que', 'regex', 'Pior que', 10, true),
  ('billing_education_comparativo', 'igual.*a', 'regex', 'Igual a', 10, true)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- BILLING EDUCATION: BANDEIRAS
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES
  ('billing_education_bandeiras', 'bandeira.*tarif', 'regex', 'Bandeira tarifária', 10, true),
  ('billing_education_bandeiras', 'bandeira.*vermelha', 'regex', 'Bandeira vermelha', 10, true),
  ('billing_education_bandeiras', 'bandeira.*amarela', 'regex', 'Bandeira amarela', 10, true),
  ('billing_education_bandeiras', 'bandeira.*verde', 'regex', 'Bandeira verde', 10, true),
  ('billing_education_bandeiras', 'escassez.*h[ií]drica', 'regex', 'Escassez hídrica', 10, true),
  ('billing_education_bandeiras', 'tarifa.*extra', 'regex', 'Tarifa extra', 10, true),
  ('billing_education_bandeiras', 'conta.*sobe', 'regex', 'Conta sobe', 10, true),
  ('billing_education_bandeiras', 'energia.*mais.*cara', 'regex', 'Energia mais cara', 10, true)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- DISQUALIFICATION: GRUPO A (Alta Tensão)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active, response_template)
VALUES
  ('disqualification_grupo_a', 'grupo a', 'keyword', 'Grupo A genérico', 10, true, 'Infelizmente não atendemos clientes do Grupo A (alta tensão). Nosso serviço é voltado para Grupo B (residencial/comercial baixa tensão).'),
  ('disqualification_grupo_a', 'alta tensão', 'keyword', 'Alta tensão', 10, true, NULL),
  ('disqualification_grupo_a', 'alta tensao', 'keyword', 'Alta tensão sem acento', 10, true, NULL),
  ('disqualification_grupo_a', 'demanda contratada', 'keyword', 'Demanda contratada', 10, true, NULL),
  ('disqualification_grupo_a', 'a1', 'keyword', 'Subgrupo A1', 10, true, NULL),
  ('disqualification_grupo_a', 'a2', 'keyword', 'Subgrupo A2', 10, true, NULL),
  ('disqualification_grupo_a', 'a3', 'keyword', 'Subgrupo A3', 10, true, NULL),
  ('disqualification_grupo_a', 'a4', 'keyword', 'Subgrupo A4', 10, true, NULL),
  ('disqualification_grupo_a', 'a3a', 'keyword', 'Subgrupo A3a', 10, true, NULL),
  ('disqualification_grupo_a', 'a4a', 'keyword', 'Subgrupo A4a', 10, true, NULL),
  ('disqualification_grupo_a', 'horo-sazonal', 'keyword', 'Horo-sazonal', 10, true, NULL),
  ('disqualification_grupo_a', 'horo sazonal', 'keyword', 'Horo sazonal', 10, true, NULL),
  ('disqualification_grupo_a', 'horosazonal', 'keyword', 'Horosazonal', 10, true, NULL),
  ('disqualification_grupo_a', 'transformador próprio', 'keyword', 'Transformador próprio', 10, true, NULL),
  ('disqualification_grupo_a', 'transformador proprio', 'keyword', 'Transformador proprio', 10, true, NULL),
  ('disqualification_grupo_a', 'subestação', 'keyword', 'Subestação', 10, true, NULL),
  ('disqualification_grupo_a', 'subestacao', 'keyword', 'Subestacao', 10, true, NULL),
  ('disqualification_grupo_a', 'cabine primária', 'keyword', 'Cabine primária', 10, true, NULL),
  ('disqualification_grupo_a', 'cabine primaria', 'keyword', 'Cabine primaria', 10, true, NULL),
  ('disqualification_grupo_a', 'cabine de medição', 'keyword', 'Cabine de medição', 10, true, NULL),
  ('disqualification_grupo_a', 'cabine de medicao', 'keyword', 'Cabine de medicao', 10, true, NULL),
  ('disqualification_grupo_a', 'medição em alta', 'keyword', 'Medição em alta', 10, true, NULL),
  ('disqualification_grupo_a', 'medicao em alta', 'keyword', 'Medicao em alta', 10, true, NULL),
  ('disqualification_grupo_a', 'média tensão', 'keyword', 'Média tensão', 10, true, NULL),
  ('disqualification_grupo_a', 'media tensao', 'keyword', 'Media tensao', 10, true, NULL),
  ('disqualification_grupo_a', 'demanda', 'keyword', 'Demanda genérico', 5, true, NULL),
  ('disqualification_grupo_a', 'demanda de potência', 'keyword', 'Demanda de potência', 10, true, NULL),
  ('disqualification_grupo_a', 'demanda de potencia', 'keyword', 'Demanda de potencia', 10, true, NULL),
  ('disqualification_grupo_a', 'kva contratado', 'keyword', 'KVA contratado', 10, true, NULL),
  ('disqualification_grupo_a', 'tarifa binômia', 'keyword', 'Tarifa binômia', 10, true, NULL),
  ('disqualification_grupo_a', 'tarifa binomia', 'keyword', 'Tarifa binomia', 10, true, NULL),
  ('disqualification_grupo_a', 'tarifa azul', 'keyword', 'Tarifa azul', 10, true, NULL),
  ('disqualification_grupo_a', 'tarifa verde', 'keyword', 'Tarifa verde', 10, true, NULL)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- DISQUALIFICATION: TARIFA SOCIAL
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active, response_template)
VALUES
  ('disqualification_tarifa_social', 'tarifa social', 'keyword', 'Tarifa social', 10, true, 'Infelizmente não podemos atender clientes com Tarifa Social/Baixa Renda, pois vocês já possuem um desconto especial do governo.'),
  ('disqualification_tarifa_social', 'baixa renda', 'keyword', 'Baixa renda', 10, true, NULL),
  ('disqualification_tarifa_social', 'desconto social', 'keyword', 'Desconto social', 10, true, NULL),
  ('disqualification_tarifa_social', 'abono', 'keyword', 'Abono', 5, true, NULL),
  ('disqualification_tarifa_social', 'abono de', 'keyword', 'Abono de', 10, true, NULL),
  ('disqualification_tarifa_social', 'isento', 'keyword', 'Isento', 10, true, NULL),
  ('disqualification_tarifa_social', 'isenção', 'keyword', 'Isenção', 10, true, NULL),
  ('disqualification_tarifa_social', 'isencao', 'keyword', 'Isencao', 10, true, NULL),
  ('disqualification_tarifa_social', 'benefício social', 'keyword', 'Benefício social', 10, true, NULL),
  ('disqualification_tarifa_social', 'beneficio social', 'keyword', 'Beneficio social', 10, true, NULL),
  ('disqualification_tarifa_social', 'programa social', 'keyword', 'Programa social', 10, true, NULL),
  ('disqualification_tarifa_social', 'cad único', 'keyword', 'CAD único', 10, true, NULL),
  ('disqualification_tarifa_social', 'cadunico', 'keyword', 'CadÚnico', 10, true, NULL),
  ('disqualification_tarifa_social', 'cadúnico', 'keyword', 'CadÚnico com acento', 10, true, NULL),
  ('disqualification_tarifa_social', 'bolsa família', 'keyword', 'Bolsa Família', 10, true, NULL),
  ('disqualification_tarifa_social', 'bolsa familia', 'keyword', 'Bolsa Familia', 10, true, NULL),
  ('disqualification_tarifa_social', 'bpc', 'keyword', 'BPC', 10, true, NULL),
  ('disqualification_tarifa_social', 'loas', 'keyword', 'LOAS', 10, true, NULL),
  ('disqualification_tarifa_social', 'benefício de prestação continuada', 'keyword', 'BPC extenso', 10, true, NULL),
  ('disqualification_tarifa_social', 'beneficio de prestacao continuada', 'keyword', 'BPC extenso sem acento', 10, true, NULL),
  ('disqualification_tarifa_social', 'conta subsidiada', 'keyword', 'Conta subsidiada', 10, true, NULL),
  ('disqualification_tarifa_social', 'subsidio', 'keyword', 'Subsídio', 10, true, NULL),
  ('disqualification_tarifa_social', 'conta social', 'keyword', 'Conta social', 10, true, NULL),
  ('disqualification_tarifa_social', 'desconto para baixa renda', 'keyword', 'Desconto baixa renda', 10, true, NULL),
  ('disqualification_tarifa_social', 'desconto baixa renda', 'keyword', 'Desconto baixa renda curto', 10, true, NULL),
  ('disqualification_tarifa_social', 'conta de luz social', 'keyword', 'Conta de luz social', 10, true, NULL),
  ('disqualification_tarifa_social', 'energia social', 'keyword', 'Energia social', 10, true, NULL),
  ('disqualification_tarifa_social', 'tarifa baixa renda', 'keyword', 'Tarifa baixa renda', 10, true, NULL),
  ('disqualification_tarifa_social', 'família de baixa renda', 'keyword', 'Família de baixa renda', 10, true, NULL),
  ('disqualification_tarifa_social', 'familia de baixa renda', 'keyword', 'Familia de baixa renda', 10, true, NULL)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- DISQUALIFICATION: GERAÇÃO PRÓPRIA
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active, response_template)
VALUES
  ('disqualification_geracao_propria', 'já tenho painel', 'keyword', 'Já tenho painel', 10, true, 'Se você já possui painéis solares instalados, nosso serviço não é compatível. Atendemos apenas quem ainda não tem geração própria.'),
  ('disqualification_geracao_propria', 'ja tenho painel', 'keyword', 'Ja tenho painel', 10, true, NULL),
  ('disqualification_geracao_propria', 'tenho placa', 'keyword', 'Tenho placa', 10, true, NULL),
  ('disqualification_geracao_propria', 'tenho painéis', 'keyword', 'Tenho painéis', 10, true, NULL),
  ('disqualification_geracao_propria', 'tenho placas', 'keyword', 'Tenho placas', 10, true, NULL),
  ('disqualification_geracao_propria', 'já tenho solar', 'keyword', 'Já tenho solar', 10, true, NULL),
  ('disqualification_geracao_propria', 'ja tenho solar', 'keyword', 'Ja tenho solar', 10, true, NULL),
  ('disqualification_geracao_propria', 'instalei solar', 'keyword', 'Instalei solar', 10, true, NULL),
  ('disqualification_geracao_propria', 'instalei painel', 'keyword', 'Instalei painel', 10, true, NULL),
  ('disqualification_geracao_propria', 'minha usina', 'keyword', 'Minha usina', 10, true, NULL),
  ('disqualification_geracao_propria', 'geração própria', 'keyword', 'Geração própria', 10, true, NULL),
  ('disqualification_geracao_propria', 'geracao propria', 'keyword', 'Geracao propria', 10, true, NULL),
  ('disqualification_geracao_propria', 'autoprodução', 'keyword', 'Autoprodução', 10, true, NULL),
  ('disqualification_geracao_propria', 'autoproducao', 'keyword', 'Autoproducao', 10, true, NULL),
  ('disqualification_geracao_propria', 'autoconsumo', 'keyword', 'Autoconsumo', 10, true, NULL),
  ('disqualification_geracao_propria', 'micro geração', 'keyword', 'Micro geração', 10, true, NULL),
  ('disqualification_geracao_propria', 'microgeração', 'keyword', 'Microgeração', 10, true, NULL),
  ('disqualification_geracao_propria', 'mini geração', 'keyword', 'Mini geração', 10, true, NULL),
  ('disqualification_geracao_propria', 'minigeração', 'keyword', 'Minigeração', 10, true, NULL),
  ('disqualification_geracao_propria', 'já produzo', 'keyword', 'Já produzo', 10, true, NULL),
  ('disqualification_geracao_propria', 'ja produzo', 'keyword', 'Ja produzo', 10, true, NULL),
  ('disqualification_geracao_propria', 'gero minha energia', 'keyword', 'Gero minha energia', 10, true, NULL),
  ('disqualification_geracao_propria', 'produzo energia', 'keyword', 'Produzo energia', 10, true, NULL)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- ECONOMY CONFIRMATION PATTERNS
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES
  ('economy_confirmation', 'então.*pago.*passa.*pagar', 'regex', 'Então pago passa a pagar', 10, true),
  ('economy_confirmation', 'se.*hoje.*amanhã', 'regex', 'Se hoje amanhã', 10, true),
  ('economy_confirmation', 'de.*\d+.*para.*\d+', 'regex', 'De X para Y', 10, true),
  ('economy_confirmation', '\d+.*para.*\d+', 'regex', 'X para Y', 10, true),
  ('economy_confirmation', '25%.*correto', 'regex', '25% correto', 10, true),
  ('economy_confirmation', 'é isso mesmo', 'keyword', 'É isso mesmo', 10, true),
  ('economy_confirmation', 'e isso mesmo', 'keyword', 'E isso mesmo', 10, true),
  ('economy_confirmation', 'entendi.*certo', 'regex', 'Entendi certo', 10, true),
  ('economy_confirmation', 'confirma.*valor', 'regex', 'Confirma valor', 10, true),
  ('economy_confirmation', 'então.*economizo', 'regex', 'Então economizo', 10, true),
  ('economy_confirmation', 'entao.*economizo', 'regex', 'Entao economizo', 10, true),
  ('economy_confirmation', 'vou.*economizar', 'regex', 'Vou economizar', 10, true),
  ('economy_confirmation', 'economia.*de.*r\$', 'regex', 'Economia de R$', 10, true),
  ('economy_confirmation', 'isso.*dá.*r\$', 'regex', 'Isso dá R$', 10, true),
  ('economy_confirmation', 'isso.*da.*r\$', 'regex', 'Isso da R$', 10, true)
ON CONFLICT DO NOTHING;