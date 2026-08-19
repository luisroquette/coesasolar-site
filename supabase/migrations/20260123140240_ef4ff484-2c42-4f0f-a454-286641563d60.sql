-- ═══════════════════════════════════════════════════════════════
-- ZERO HARDCODE FASE 7: maria-triage, funnel-stage, llm-client, zapi-client
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- PART 1: TRIAGE CATEGORY DETECTION PATTERNS (maria-triage.ts)
-- ═══════════════════════════════════════════════════════════════

-- WRONG NUMBER KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_wrong_number', 'número errado', 'keyword', NULL, true),
  ('triage_wrong_number', 'numero errado', 'keyword', NULL, true),
  ('triage_wrong_number', 'mandou errado', 'keyword', NULL, true),
  ('triage_wrong_number', 'não pedi nada', 'keyword', NULL, true),
  ('triage_wrong_number', 'nao pedi nada', 'keyword', NULL, true),
  ('triage_wrong_number', 'nunca entrei em contato', 'keyword', NULL, true),
  ('triage_wrong_number', 'como conseguiram meu número', 'keyword', NULL, true),
  ('triage_wrong_number', 'não conheço vocês', 'keyword', NULL, true),
  ('triage_wrong_number', 'nao conheco voces', 'keyword', NULL, true),
  ('triage_wrong_number', 'nunca ouvi falar', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- PARTNER B2B KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_partner_b2b', 'sou representante', 'keyword', NULL, true),
  ('triage_partner_b2b', 'quero oferecer', 'keyword', NULL, true),
  ('triage_partner_b2b', 'trabalho na área', 'keyword', NULL, true),
  ('triage_partner_b2b', 'trabalho na area', 'keyword', NULL, true),
  ('triage_partner_b2b', 'sou vendedor', 'keyword', NULL, true),
  ('triage_partner_b2b', 'proposta para vocês', 'keyword', NULL, true),
  ('triage_partner_b2b', 'proposta para voces', 'keyword', NULL, true),
  ('triage_partner_b2b', 'parceria comercial', 'keyword', NULL, true),
  ('triage_partner_b2b', 'oportunidade de negócio', 'keyword', NULL, true),
  ('triage_partner_b2b', 'oportunidade de negocio', 'keyword', NULL, true),
  ('triage_partner_b2b', 'trabalhar com vocês', 'keyword', NULL, true),
  ('triage_partner_b2b', 'trabalhar com voces', 'keyword', NULL, true),
  ('triage_partner_b2b', 'ser parceiro', 'keyword', NULL, true),
  ('triage_partner_b2b', 'vender para vocês', 'keyword', NULL, true),
  ('triage_partner_b2b', 'vender para voces', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- IDENTITY CONFUSION KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_identity_confusion', 'são da cemig', 'keyword', NULL, true),
  ('triage_identity_confusion', 'sao da cemig', 'keyword', NULL, true),
  ('triage_identity_confusion', 'é da cemig', 'keyword', NULL, true),
  ('triage_identity_confusion', 'e da cemig', 'keyword', NULL, true),
  ('triage_identity_confusion', 'é da concessionária', 'keyword', NULL, true),
  ('triage_identity_confusion', 'e da concessionaria', 'keyword', NULL, true),
  ('triage_identity_confusion', 'é do governo', 'keyword', NULL, true),
  ('triage_identity_confusion', 'e do governo', 'keyword', NULL, true),
  ('triage_identity_confusion', 'é empresa pública', 'keyword', NULL, true),
  ('triage_identity_confusion', 'e empresa publica', 'keyword', NULL, true),
  ('triage_identity_confusion', 'é estatal', 'keyword', NULL, true),
  ('triage_identity_confusion', 'e estatal', 'keyword', NULL, true),
  ('triage_identity_confusion', 'são da prefeitura', 'keyword', NULL, true),
  ('triage_identity_confusion', 'sao da prefeitura', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- SERVICE NOT OFFERED KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_service_not_offered', 'instalar painel', 'keyword', NULL, true),
  ('triage_service_not_offered', 'instalar placa', 'keyword', NULL, true),
  ('triage_service_not_offered', 'comprar placa', 'keyword', NULL, true),
  ('triage_service_not_offered', 'comprar painel', 'keyword', NULL, true),
  ('triage_service_not_offered', 'instalação de energia solar', 'keyword', NULL, true),
  ('triage_service_not_offered', 'instalacao de energia solar', 'keyword', NULL, true),
  ('triage_service_not_offered', 'kit solar', 'keyword', NULL, true),
  ('triage_service_not_offered', 'financiamento de placa', 'keyword', NULL, true),
  ('triage_service_not_offered', 'financiamento de painel', 'keyword', NULL, true),
  ('triage_service_not_offered', 'vocês instalam', 'keyword', NULL, true),
  ('triage_service_not_offered', 'voces instalam', 'keyword', NULL, true),
  ('triage_service_not_offered', 'vocês vendem placa', 'keyword', NULL, true),
  ('triage_service_not_offered', 'voces vendem placa', 'keyword', NULL, true),
  ('triage_service_not_offered', 'vocês vendem painel', 'keyword', NULL, true),
  ('triage_service_not_offered', 'voces vendem painel', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- THIRD PARTY KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_third_party', 'minha mãe é cliente', 'keyword', NULL, true),
  ('triage_third_party', 'minha mae e cliente', 'keyword', NULL, true),
  ('triage_third_party', 'meu pai é cliente', 'keyword', NULL, true),
  ('triage_third_party', 'meu pai e cliente', 'keyword', NULL, true),
  ('triage_third_party', 'minha esposa é cliente', 'keyword', NULL, true),
  ('triage_third_party', 'minha esposa e cliente', 'keyword', NULL, true),
  ('triage_third_party', 'meu marido é cliente', 'keyword', NULL, true),
  ('triage_third_party', 'meu marido e cliente', 'keyword', NULL, true),
  ('triage_third_party', 'conta do meu', 'keyword', NULL, true),
  ('triage_third_party', 'conta da minha', 'keyword', NULL, true),
  ('triage_third_party', 'contrato do meu', 'keyword', NULL, true),
  ('triage_third_party', 'contrato da minha', 'keyword', NULL, true),
  ('triage_third_party', 'em nome de', 'keyword', NULL, true),
  ('triage_third_party', 'em nome da', 'keyword', NULL, true),
  ('triage_third_party', 'em nome do', 'keyword', NULL, true),
  ('triage_third_party', 'no nome de outra pessoa', 'keyword', NULL, true),
  ('triage_third_party', 'é de outra pessoa', 'keyword', NULL, true),
  ('triage_third_party', 'e de outra pessoa', 'keyword', NULL, true),
  ('triage_third_party', 'não é minha conta', 'keyword', NULL, true),
  ('triage_third_party', 'nao e minha conta', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- CORPORATE/CONDOMINIUM KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_corporate', 'aqui é o condomínio', 'keyword', NULL, true),
  ('triage_corporate', 'aqui e o condominio', 'keyword', NULL, true),
  ('triage_corporate', 'sou síndico', 'keyword', NULL, true),
  ('triage_corporate', 'sou sindico', 'keyword', NULL, true),
  ('triage_corporate', 'sou administrador', 'keyword', NULL, true),
  ('triage_corporate', 'várias lojas', 'keyword', NULL, true),
  ('triage_corporate', 'varias lojas', 'keyword', NULL, true),
  ('triage_corporate', 'várias unidades', 'keyword', NULL, true),
  ('triage_corporate', 'varias unidades', 'keyword', NULL, true),
  ('triage_corporate', 'somos empresa', 'keyword', NULL, true),
  ('triage_corporate', 'várias contas de luz', 'keyword', NULL, true),
  ('triage_corporate', 'varias contas de luz', 'keyword', NULL, true),
  ('triage_corporate', 'mais de uma conta', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- SCHEDULING KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_scheduling', 'marcar uma visita', 'keyword', NULL, true),
  ('triage_scheduling', 'agendar uma visita', 'keyword', NULL, true),
  ('triage_scheduling', 'quero uma reunião', 'keyword', NULL, true),
  ('triage_scheduling', 'quero uma reuniao', 'keyword', NULL, true),
  ('triage_scheduling', 'marcar reunião', 'keyword', NULL, true),
  ('triage_scheduling', 'marcar reuniao', 'keyword', NULL, true),
  ('triage_scheduling', 'conversar pessoalmente', 'keyword', NULL, true),
  ('triage_scheduling', 'atendimento presencial', 'keyword', NULL, true),
  ('triage_scheduling', 'ir até vocês', 'keyword', NULL, true),
  ('triage_scheduling', 'ir ate voces', 'keyword', NULL, true),
  ('triage_scheduling', 'endereço do escritório', 'keyword', NULL, true),
  ('triage_scheduling', 'endereco do escritorio', 'keyword', NULL, true),
  ('triage_scheduling', 'visita técnica', 'keyword', NULL, true),
  ('triage_scheduling', 'visita tecnica', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- RETURN CONTACT KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_return_contact', 'vocês me ligaram', 'keyword', NULL, true),
  ('triage_return_contact', 'voces me ligaram', 'keyword', NULL, true),
  ('triage_return_contact', 'me mandaram mensagem', 'keyword', NULL, true),
  ('triage_return_contact', 'me ligaram antes', 'keyword', NULL, true),
  ('triage_return_contact', 'me mandaram email', 'keyword', NULL, true),
  ('triage_return_contact', 'recebi uma proposta', 'keyword', NULL, true),
  ('triage_return_contact', 'recebi uma ligação', 'keyword', NULL, true),
  ('triage_return_contact', 'recebi uma ligacao', 'keyword', NULL, true),
  ('triage_return_contact', 'alguém me ligou', 'keyword', NULL, true),
  ('triage_return_contact', 'alguem me ligou', 'keyword', NULL, true),
  ('triage_return_contact', 'retornando a ligação', 'keyword', NULL, true),
  ('triage_return_contact', 'retornando a ligacao', 'keyword', NULL, true),
  ('triage_return_contact', 'sobre a ligação', 'keyword', NULL, true),
  ('triage_return_contact', 'sobre a ligacao', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- INSTITUTIONAL KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_institutional', 'qual o cnpj', 'keyword', NULL, true),
  ('triage_institutional', 'cnpj da empresa', 'keyword', NULL, true),
  ('triage_institutional', 'endereço da empresa', 'keyword', NULL, true),
  ('triage_institutional', 'endereco da empresa', 'keyword', NULL, true),
  ('triage_institutional', 'site oficial', 'keyword', NULL, true),
  ('triage_institutional', 'telefone fixo', 'keyword', NULL, true),
  ('triage_institutional', 'preciso de comprovante', 'keyword', NULL, true),
  ('triage_institutional', 'declaração da empresa', 'keyword', NULL, true),
  ('triage_institutional', 'declaracao da empresa', 'keyword', NULL, true),
  ('triage_institutional', 'razão social da coesa', 'keyword', NULL, true),
  ('triage_institutional', 'razao social da coesa', 'keyword', NULL, true),
  ('triage_institutional', 'sócio da empresa', 'keyword', NULL, true),
  ('triage_institutional', 'socio da empresa', 'keyword', NULL, true),
  ('triage_institutional', 'dono da empresa', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- FORWARDING KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_forwarding', 'vizinho perguntou', 'keyword', NULL, true),
  ('triage_forwarding', 'amiga quer saber', 'keyword', NULL, true),
  ('triage_forwarding', 'amigo perguntou', 'keyword', NULL, true),
  ('triage_forwarding', 'pergunta de um colega', 'keyword', NULL, true),
  ('triage_forwarding', 'pediu pra perguntar', 'keyword', NULL, true),
  ('triage_forwarding', 'perguntando pra outra pessoa', 'keyword', NULL, true),
  ('triage_forwarding', 'em nome de um amigo', 'keyword', NULL, true),
  ('triage_forwarding', 'em nome de uma amiga', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- BILLING KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_billing', 'boleto', 'keyword', NULL, true),
  ('triage_billing', 'pagamento', 'keyword', NULL, true),
  ('triage_billing', 'parcela', 'keyword', NULL, true),
  ('triage_billing', 'vencimento', 'keyword', NULL, true),
  ('triage_billing', 'segunda via', 'keyword', NULL, true),
  ('triage_billing', 'débito', 'keyword', NULL, true),
  ('triage_billing', 'debito', 'keyword', NULL, true),
  ('triage_billing', 'cobrança', 'keyword', NULL, true),
  ('triage_billing', 'cobranca', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- CONTRACT STATUS KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_contract_status', 'homologação', 'keyword', NULL, true),
  ('triage_contract_status', 'homologacao', 'keyword', NULL, true),
  ('triage_contract_status', 'liberação', 'keyword', NULL, true),
  ('triage_contract_status', 'liberacao', 'keyword', NULL, true),
  ('triage_contract_status', 'ativação', 'keyword', NULL, true),
  ('triage_contract_status', 'ativacao', 'keyword', NULL, true),
  ('triage_contract_status', 'quando começa', 'keyword', NULL, true),
  ('triage_contract_status', 'quando comeca', 'keyword', NULL, true),
  ('triage_contract_status', 'andamento', 'keyword', NULL, true),
  ('triage_contract_status', 'status', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- INVOICE ISSUES KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_invoice_issues', 'desconto não', 'keyword', NULL, true),
  ('triage_invoice_issues', 'desconto nao', 'keyword', NULL, true),
  ('triage_invoice_issues', 'conta veio', 'keyword', NULL, true),
  ('triage_invoice_issues', 'crédito não', 'keyword', NULL, true),
  ('triage_invoice_issues', 'credito nao', 'keyword', NULL, true),
  ('triage_invoice_issues', 'economia não', 'keyword', NULL, true),
  ('triage_invoice_issues', 'economia nao', 'keyword', NULL, true),
  ('triage_invoice_issues', 'fatura errada', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- CADASTRAL KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_cadastral', 'mudar meu', 'keyword', NULL, true),
  ('triage_cadastral', 'atualizar', 'keyword', NULL, true),
  ('triage_cadastral', 'alterar', 'keyword', NULL, true),
  ('triage_cadastral', 'trocar titular', 'keyword', NULL, true),
  ('triage_cadastral', 'mudei de', 'keyword', NULL, true),
  ('triage_cadastral', 'novo endereço', 'keyword', NULL, true),
  ('triage_cadastral', 'novo endereco', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- COMPLAINT KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_complaint', 'reclamação', 'keyword', NULL, true),
  ('triage_complaint', 'reclamacao', 'keyword', NULL, true),
  ('triage_complaint', 'insatisfeito', 'keyword', NULL, true),
  ('triage_complaint', 'decepcionado', 'keyword', NULL, true),
  ('triage_complaint', 'procon', 'keyword', NULL, true),
  ('triage_complaint', 'propaganda enganosa', 'keyword', NULL, true),
  ('triage_complaint', 'não estou satisfeito', 'keyword', NULL, true),
  ('triage_complaint', 'nao estou satisfeito', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- REFERRAL KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_referral', 'indicação', 'keyword', NULL, true),
  ('triage_referral', 'indicacao', 'keyword', NULL, true),
  ('triage_referral', 'indiquei', 'keyword', NULL, true),
  ('triage_referral', 'cashback', 'keyword', NULL, true),
  ('triage_referral', 'bonificação', 'keyword', NULL, true),
  ('triage_referral', 'bonificacao', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- SUPPORT GENERIC KEYWORDS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('triage_support_generic', 'ajuda', 'keyword', NULL, true),
  ('triage_support_generic', 'suporte', 'keyword', NULL, true),
  ('triage_support_generic', 'falar com', 'keyword', NULL, true),
  ('triage_support_generic', 'urgente', 'keyword', NULL, true),
  ('triage_support_generic', 'problema', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- ORIENTATION QUESTIONS (early exit for commercial flow)
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('orientation_question', 'como descubro', 'keyword', NULL, true),
  ('orientation_question', 'como faço', 'keyword', NULL, true),
  ('orientation_question', 'onde vejo', 'keyword', NULL, true),
  ('orientation_question', 'onde acho', 'keyword', NULL, true),
  ('orientation_question', 'onde encontro', 'keyword', NULL, true),
  ('orientation_question', 'não sei o que', 'keyword', NULL, true),
  ('orientation_question', 'nao sei o que', 'keyword', NULL, true),
  ('orientation_question', 'não sei oque', 'keyword', NULL, true),
  ('orientation_question', 'nao sei oque', 'keyword', NULL, true),
  ('orientation_question', 'não sei como', 'keyword', NULL, true),
  ('orientation_question', 'nao sei como', 'keyword', NULL, true),
  ('orientation_question', 'o que é isso', 'keyword', NULL, true),
  ('orientation_question', 'o que e isso', 'keyword', NULL, true),
  ('orientation_question', 'me explica', 'keyword', NULL, true),
  ('orientation_question', 'pode explicar', 'keyword', NULL, true),
  ('orientation_question', 'como saber', 'keyword', NULL, true),
  ('orientation_question', 'como ver', 'keyword', NULL, true),
  ('orientation_question', 'não entendi', 'keyword', NULL, true),
  ('orientation_question', 'nao entendi', 'keyword', NULL, true),
  ('orientation_question', 'pode me ajudar', 'keyword', NULL, true),
  ('orientation_question', 'me ajuda com', 'keyword', NULL, true),
  ('orientation_question', 'como assim', 'keyword', NULL, true),
  ('orientation_question', 'não sei qual', 'keyword', NULL, true),
  ('orientation_question', 'nao sei qual', 'keyword', NULL, true),
  ('orientation_question', 'qual é o', 'keyword', NULL, true),
  ('orientation_question', 'qual e o', 'keyword', NULL, true),
  ('orientation_question', 'não tenho certeza', 'keyword', NULL, true),
  ('orientation_question', 'nao tenho certeza', 'keyword', NULL, true),
  ('orientation_question', 'como funciona isso', 'keyword', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- PART 2: PROPOSAL DETECTION PATTERNS (funnel-stage.ts)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, response_template, is_active)
VALUES
  ('proposal_promise', 'vou (?:gerar|preparar|criar|montar|fazer) (?:a |sua )?proposta', 'regex', NULL, true),
  ('proposal_promise', 'gerando (?:a |sua )?proposta', 'regex', NULL, true),
  ('proposal_promise', 'proposta (?:está sendo|já está) (?:gerada|preparada)', 'regex', NULL, true),
  ('proposal_promise', '(?:aguarde|espera|só um momento).{0,30}proposta', 'regex', NULL, true),
  ('proposal_promise', 'sistema (?:vai|está) gera(?:ndo|r)', 'regex', NULL, true),
  ('proposal_promise', 'em instantes (?:você )?recebe', 'regex', NULL, true),
  ('proposal_promise', 'já vou (?:te )?enviar', 'regex', NULL, true),
  ('proposal_promise', 'mandando (?:a |sua )?proposta', 'regex', NULL, true),
  ('proposal_acceptance', '^sim\\b', 'regex', NULL, true),
  ('proposal_acceptance', '^pode\\b', 'regex', NULL, true),
  ('proposal_acceptance', '^gera\\b', 'regex', NULL, true),
  ('proposal_acceptance', '^quero\\b', 'regex', NULL, true),
  ('proposal_acceptance', '^manda\\b', 'regex', NULL, true),
  ('proposal_acceptance', '\\bpode gerar\\b', 'regex', NULL, true),
  ('proposal_acceptance', '\\bgera a proposta\\b', 'regex', NULL, true),
  ('proposal_acceptance', '\\bquero a proposta\\b', 'regex', NULL, true),
  ('proposal_acceptance', '\\bvamos l[áa]\\b', 'regex', NULL, true),
  ('proposal_acceptance', '\\bbora\\b', 'regex', NULL, true),
  ('proposal_acceptance', '\\bfecha\\b', 'regex', NULL, true),
  ('proposal_acceptance', '\\bfaz a[íi]\\b', 'regex', NULL, true)
ON CONFLICT (category, pattern) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- PART 3: PAUSED MODES (zapi-client.ts)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('paused_sofia_modes', 'paused_for_human,human_takeover,paused,manual', 'Modos de Sofia que bloqueiam envio de mensagens automáticas')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW();

-- ═══════════════════════════════════════════════════════════════
-- PART 4: FUNNEL STAGE & SOFIA MODE LABELS (funnel-stage.ts)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO sofia_message_templates (category, template_key, template_text, variables, is_active)
VALUES
  ('funnel_label', 'coleta_dados', 'Coleta de Dados', ARRAY[]::text[], true),
  ('funnel_label', 'proposta_inicial', 'Pronto para Proposta', ARRAY[]::text[], true),
  ('funnel_label', 'proposta_inicial_enviada', 'Proposta Inicial Enviada', ARRAY[]::text[], true),
  ('funnel_label', 'proposta_definitiva', 'Proposta Definitiva', ARRAY[]::text[], true),
  ('funnel_label', 'fechamento', 'Fechamento', ARRAY[]::text[], true),
  ('sofia_mode_label', 'standard', 'Consultivo', ARRAY[]::text[], true),
  ('sofia_mode_label', 'closer_premium', 'Closer Premium', ARRAY[]::text[], true),
  ('sofia_mode_label', 'contract_closer', 'Fechamento de Contrato', ARRAY[]::text[], true),
  ('sofia_mode_label', 'paused_for_human', 'Pausado (Atendimento Humano)', ARRAY[]::text[], true)
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, updated_at = NOW();

-- ═══════════════════════════════════════════════════════════════
-- PART 5: Z-API & LLM CLIENT CONSTANTS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('zapi_max_message_length', '4000', 'Tamanho máximo de mensagem WhatsApp'),
  ('zapi_retry_delays_ms', '1000,2000,4000', 'Delays de retry para Z-API em ms (comma-separated)'),
  ('ai_gateway_url', 'https://ai.gateway.lovable.dev/v1/chat/completions', 'URL do gateway de IA Lovable'),
  ('token_estimate_chars_per_token', '4', 'Estimativa de caracteres por token (para português)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW();