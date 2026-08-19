-- ═══════════════════════════════════════════════════════════════
-- Zero Hardcode Fase 5B: Mensagens Nudge + Patterns Delay/Media
-- ═══════════════════════════════════════════════════════════════

-- 1. DELAY INTENT PATTERNS
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, is_active) VALUES
  ('delay_intent', 'espera um pouco', 'keyword', 'Indica que vai responder depois', true),
  ('delay_intent', 'daqui a pouco', 'keyword', 'Indica que vai responder depois', true),
  ('delay_intent', 'minutos', 'keyword', 'Indica tempo curto de espera', true),
  ('delay_intent', 'minutinho', 'keyword', 'Indica tempo curto de espera', true),
  ('delay_intent', 'minutinhos', 'keyword', 'Indica tempo curto de espera', true),
  ('delay_intent', 'quando chegar', 'keyword', 'Indica que vai responder depois', true),
  ('delay_intent', 'mais tarde', 'keyword', 'Indica que vai responder depois', true),
  ('delay_intent', 'já já', 'keyword', 'Indica resposta iminente', true),
  ('delay_intent', 'jaja', 'keyword', 'Indica resposta iminente (sem acento)', true),
  ('delay_intent', 'logo logo', 'keyword', 'Indica resposta iminente', true),
  ('delay_intent', 'to chegando', 'keyword', 'Indica que está se deslocando', true),
  ('delay_intent', 'estou chegando', 'keyword', 'Indica que está se deslocando', true),
  ('delay_intent', 'tô chegando', 'keyword', 'Indica que está se deslocando', true),
  ('delay_intent', 'em breve', 'keyword', 'Indica resposta futura', true)
ON CONFLICT (category, pattern) DO UPDATE SET is_active = true;

-- 2. MENTIONS MEDIA PATTERNS 
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, is_active) VALUES
  ('mentions_media', 'enviei', 'keyword', 'Indica que enviou arquivo', true),
  ('mentions_media', 'mandei', 'keyword', 'Indica que enviou arquivo', true),
  ('mentions_media', 'segue', 'keyword', 'Indica envio de arquivo', true),
  ('mentions_media', 'essa é minha conta', 'keyword', 'Refere-se à conta de luz', true),
  ('mentions_media', 'essa é minha fatura', 'keyword', 'Refere-se à fatura', true),
  ('mentions_media', 'veja minha', 'keyword', 'Refere-se a documento enviado', true),
  ('mentions_media', 'olha aqui', 'keyword', 'Indica que enviou algo', true),
  ('mentions_media', 'olha a minha', 'keyword', 'Refere-se a documento', true),
  ('mentions_media', 'tá aqui', 'keyword', 'Indica que enviou algo', true),
  ('mentions_media', 'está aqui', 'keyword', 'Indica que enviou algo', true),
  ('mentions_media', 'minha conta de luz', 'keyword', 'Refere-se à conta', true),
  ('mentions_media', 'minha fatura', 'keyword', 'Refere-se à fatura', true),
  ('mentions_media', 'enviando', 'keyword', 'Indica envio em andamento', true),
  ('mentions_media', 'mandando', 'keyword', 'Indica envio em andamento', true),
  ('mentions_media', 'segue a foto', 'keyword', 'Indica envio de foto', true),
  ('mentions_media', 'segue a fatura', 'keyword', 'Indica envio de fatura', true),
  ('mentions_media', 'essa aqui é', 'keyword', 'Indica envio de documento', true),
  ('mentions_media', 'aqui está', 'keyword', 'Indica envio de documento', true)
ON CONFLICT (category, pattern) DO UPDATE SET is_active = true;

-- 3. NUDGE MESSAGES - Regular (níveis 1-3)
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, is_active, description) VALUES
  ('nudge', 'regular', 'regular_1_1', 'Oi, você ainda está aí? 😊', ARRAY[]::text[], true, 'Nudge regular nível 1'),
  ('nudge', 'regular', 'regular_1_2', 'Ficou alguma dúvida sobre o que conversamos?', ARRAY[]::text[], true, 'Nudge regular nível 1'),
  ('nudge', 'regular', 'regular_1_3', 'Posso te ajudar com mais alguma coisa?', ARRAY[]::text[], true, 'Nudge regular nível 1'),
  ('nudge', 'regular', 'regular_1_4', 'Tudo certo por aí? Estou aqui se precisar!', ARRAY[]::text[], true, 'Nudge regular nível 1'),
  ('nudge', 'regular', 'regular_1_5', 'Ei, ainda estou aqui caso precise de algo! 👋', ARRAY[]::text[], true, 'Nudge regular nível 1'),
  ('nudge', 'regular', 'regular_2_1', 'Sem problemas se estiver ocupado(a)! Fico por aqui quando precisar.', ARRAY[]::text[], true, 'Nudge regular nível 2'),
  ('nudge', 'regular', 'regular_2_2', 'Sei que o dia é corrido. Quando puder, a gente continua! 😊', ARRAY[]::text[], true, 'Nudge regular nível 2'),
  ('nudge', 'regular', 'regular_2_3', 'Fique à vontade pra responder quando der!', ARRAY[]::text[], true, 'Nudge regular nível 2'),
  ('nudge', 'regular', 'regular_2_4', 'Entendo que pode estar ocupado(a). Continuo disponível aqui!', ARRAY[]::text[], true, 'Nudge regular nível 2'),
  ('nudge', 'regular', 'regular_2_5', 'Tá tudo bem! Quando tiver um minutinho, me avisa.', ARRAY[]::text[], true, 'Nudge regular nível 2'),
  ('nudge', 'regular', 'regular_3_1', 'Quando puder, me avisa que a gente retoma de onde parou! 😉', ARRAY[]::text[], true, 'Nudge regular nível 3'),
  ('nudge', 'regular', 'regular_3_2', 'Vou deixar a conversa salva aqui. É só mandar um "oi" quando quiser continuar!', ARRAY[]::text[], true, 'Nudge regular nível 3'),
  ('nudge', 'regular', 'regular_3_3', 'Fico no aguardo! Qualquer coisa, é só chamar.', ARRAY[]::text[], true, 'Nudge regular nível 3'),
  ('nudge', 'regular', 'regular_3_4', 'A conversa fica salva aqui. Volta quando quiser continuar! 👋', ARRAY[]::text[], true, 'Nudge regular nível 3'),
  ('nudge', 'regular', 'regular_3_5', 'Estarei por aqui. Só me mandar uma mensagem quando tiver tempo!', ARRAY[]::text[], true, 'Nudge regular nível 3')
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, is_active = true;

-- 4. CONTRACT NUDGE MESSAGES (níveis 1-3)
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, is_active, description) VALUES
  ('nudge', 'contract', 'contract_1_1', 'E aí, conseguiu dar uma olhada no contrato? Posso resumir os pontos principais se quiser!', ARRAY[]::text[], true, 'Nudge contrato nível 1'),
  ('nudge', 'contract', 'contract_1_2', 'Tudo certo com o e-mail do contrato? Se não encontrou, posso pedir pra reenviar.', ARRAY[]::text[], true, 'Nudge contrato nível 1'),
  ('nudge', 'contract', 'contract_1_3', 'Ficou alguma dúvida sobre o contrato? Tô aqui pra ajudar!', ARRAY[]::text[], true, 'Nudge contrato nível 1'),
  ('nudge', 'contract', 'contract_1_4', 'Vi que o contrato foi enviado. Quer que eu explique alguma cláusula?', ARRAY[]::text[], true, 'Nudge contrato nível 1'),
  ('nudge', 'contract', 'contract_2_1', 'Oi! Passando pra lembrar que seu contrato tá esperando assinatura. Menos de 1 minuto e você já começa a economizar! 💚', ARRAY[]::text[], true, 'Nudge contrato nível 2'),
  ('nudge', 'contract', 'contract_2_2', 'Seu desconto está a uma assinatura de distância! Posso ajudar com algo?', ARRAY[]::text[], true, 'Nudge contrato nível 2'),
  ('nudge', 'contract', 'contract_2_3', 'Vi que o contrato ainda não foi assinado. Tem algo que posso esclarecer?', ARRAY[]::text[], true, 'Nudge contrato nível 2'),
  ('nudge', 'contract', 'contract_2_4', 'Lembrete gentil: seu contrato digital está aguardando. Alguma dúvida sobre as cláusulas?', ARRAY[]::text[], true, 'Nudge contrato nível 2'),
  ('nudge', 'contract', 'contract_3_1', 'Olá! Notei que o contrato ainda está pendente. Se tiver qualquer dúvida, estou à disposição!', ARRAY[]::text[], true, 'Nudge contrato nível 3'),
  ('nudge', 'contract', 'contract_3_2', 'Última lembrança: seu contrato está aguardando assinatura. Após assinar, a economia começa em até 90 dias!', ARRAY[]::text[], true, 'Nudge contrato nível 3'),
  ('nudge', 'contract', 'contract_3_3', 'Posso ajudar com alguma cláusula específica? Tô aqui pra descomplicar 😊', ARRAY[]::text[], true, 'Nudge contrato nível 3'),
  ('nudge', 'contract', 'contract_3_4', 'Seu contrato segue disponível para assinatura. Me avisa se precisar de ajuda com algum ponto!', ARRAY[]::text[], true, 'Nudge contrato nível 3')
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, is_active = true;

-- 5. DOC NUDGE MESSAGES (níveis 1-6)
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, is_active, description) VALUES
  ('nudge', 'doc', 'doc_1_1', 'Oi! Vi que faltam só os documentos pra gente seguir com sua proposta. Posso te ajudar a agilizar?', ARRAY[]::text[], true, 'Nudge docs nível 1'),
  ('nudge', 'doc', 'doc_1_2', 'Quando puder enviar os documentos, é só mandar aqui mesmo! Aceito foto, PDF... 📄', ARRAY[]::text[], true, 'Nudge docs nível 1'),
  ('nudge', 'doc', 'doc_1_3', 'Lembrando que pra gerar sua proposta completa preciso só da conta de luz e documento de identidade!', ARRAY[]::text[], true, 'Nudge docs nível 1'),
  ('nudge', 'doc', 'doc_2_1', 'Ainda aguardando seus documentos! Qualquer dúvida sobre quais enviar, é só perguntar 😊', ARRAY[]::text[], true, 'Nudge docs nível 2'),
  ('nudge', 'doc', 'doc_2_2', 'Sem pressa! Quando tiver os docs em mãos, manda pra mim que a gente continua.', ARRAY[]::text[], true, 'Nudge docs nível 2'),
  ('nudge', 'doc', 'doc_2_3', 'Tô por aqui quando você puder enviar os documentos!', ARRAY[]::text[], true, 'Nudge docs nível 2'),
  ('nudge', 'doc', 'doc_3_1', 'Oi! Passando pra lembrar dos documentos. É rapidinho pra enviar! 📸', ARRAY[]::text[], true, 'Nudge docs nível 3'),
  ('nudge', 'doc', 'doc_3_2', 'Seus documentos são o último passo antes da proposta. Posso ajudar com algo?', ARRAY[]::text[], true, 'Nudge docs nível 3'),
  ('nudge', 'doc', 'doc_3_3', 'Quando puder, manda os docs e a gente finaliza sua proposta!', ARRAY[]::text[], true, 'Nudge docs nível 3'),
  ('nudge', 'doc', 'doc_4_1', 'Ainda estou por aqui! Só faltam os documentos pra sua economia começar 💚', ARRAY[]::text[], true, 'Nudge docs nível 4'),
  ('nudge', 'doc', 'doc_4_2', 'Quer que eu explique de novo quais documentos preciso? Tô aqui pra ajudar!', ARRAY[]::text[], true, 'Nudge docs nível 4'),
  ('nudge', 'doc', 'doc_4_3', 'Lembrete: sua proposta está quase pronta! Só depende dos documentos.', ARRAY[]::text[], true, 'Nudge docs nível 4'),
  ('nudge', 'doc', 'doc_5_1', 'Última lembrança sobre os documentos! Quando puder, manda aqui que a gente agiliza tudo.', ARRAY[]::text[], true, 'Nudge docs nível 5'),
  ('nudge', 'doc', 'doc_5_2', 'Faltando só os docs! Aceito CNH, RG ou qualquer documento com foto + conta de luz.', ARRAY[]::text[], true, 'Nudge docs nível 5'),
  ('nudge', 'doc', 'doc_5_3', 'Quando você enviar os documentos, sua proposta fica pronta na hora!', ARRAY[]::text[], true, 'Nudge docs nível 5'),
  ('nudge', 'doc', 'doc_6_1', 'Seus documentos são tudo que falta pra você começar a economizar. Me avisa se tiver dúvida!', ARRAY[]::text[], true, 'Nudge docs nível 6'),
  ('nudge', 'doc', 'doc_6_2', 'Última mensagem sobre isso: quando enviar os docs, sua proposta sai na hora! 🚀', ARRAY[]::text[], true, 'Nudge docs nível 6'),
  ('nudge', 'doc', 'doc_6_3', 'Ainda aguardando seus documentos. Qualquer dúvida, é só perguntar!', ARRAY[]::text[], true, 'Nudge docs nível 6')
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, is_active = true;

-- 6. NUDGE DELAYS (configuracoes_sistema)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('nudge_regular_delay_1_ms', '600000', 'Delay do nudge regular nível 1 (10 min)'),
  ('nudge_regular_delay_2_ms', '1800000', 'Delay do nudge regular nível 2 (30 min)'),
  ('nudge_regular_delay_3_ms', '7200000', 'Delay do nudge regular nível 3 (2h)'),
  ('nudge_contract_delay_1_ms', '7200000', 'Delay do nudge de contrato nível 1 (2h)'),
  ('nudge_contract_delay_2_ms', '86400000', 'Delay do nudge de contrato nível 2 (24h)'),
  ('nudge_contract_delay_3_ms', '172800000', 'Delay do nudge de contrato nível 3 (48h)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, descricao = EXCLUDED.descricao;