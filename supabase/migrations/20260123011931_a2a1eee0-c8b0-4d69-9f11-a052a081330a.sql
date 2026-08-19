-- ═══════════════════════════════════════════════════════════════
-- ZERO HARDCODE FASE 6: Migração de Constantes Restantes
-- Migra TODOS os arrays e constantes hardcoded para o banco
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. TYPO CONFIRMATION KEYWORDS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO sofia_detection_patterns (category, pattern, response_template, is_active, priority) VALUES
-- Confirmation keywords
('typo_confirmation', 'sim', NULL, true, 10),
('typo_confirmation', 'isso', NULL, true, 10),
('typo_confirmation', 'essa', NULL, true, 10),
('typo_confirmation', 'é isso', NULL, true, 10),
('typo_confirmation', 'exato', NULL, true, 10),
('typo_confirmation', 'certo', NULL, true, 10),
('typo_confirmation', 'correto', NULL, true, 10),
('typo_confirmation', 'isso mesmo', NULL, true, 10),
('typo_confirmation', 'exatamente', NULL, true, 10),
('typo_confirmation', 'confirmado', NULL, true, 10),
('typo_confirmation', 'é essa', NULL, true, 10),
('typo_confirmation', 'pode ser', NULL, true, 10),
('typo_confirmation', 'uhum', NULL, true, 10),
('typo_confirmation', 'aham', NULL, true, 10),
('typo_confirmation', 'positivo', NULL, true, 10),
('typo_confirmation', 'afirmativo', NULL, true, 10),
('typo_confirmation', 'é sim', NULL, true, 10),
('typo_confirmation', 'é isso aí', NULL, true, 10),
-- Rejection keywords
('typo_rejection', 'não', NULL, true, 10),
('typo_rejection', 'nao', NULL, true, 10),
('typo_rejection', 'errado', NULL, true, 10),
('typo_rejection', 'outra', NULL, true, 10),
('typo_rejection', 'diferente', NULL, true, 10),
('typo_rejection', 'negativo', NULL, true, 10),
('typo_rejection', 'não é', NULL, true, 10),
('typo_rejection', 'nao e', NULL, true, 10),
('typo_rejection', 'não é essa', NULL, true, 10),
('typo_rejection', 'errada', NULL, true, 10),
('typo_rejection', 'incorreto', NULL, true, 10),
('typo_rejection', 'outra coisa', NULL, true, 10),
('typo_rejection', 'outra distribuidora', NULL, true, 10),
('typo_rejection', 'não é isso', NULL, true, 10)
ON CONFLICT (category, pattern) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 2. TECHNICAL ISSUES KEYWORDS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO sofia_detection_patterns (category, pattern, response_template, is_active, priority) VALUES
-- Broken Link keywords
('tech_link_quebrado', 'link não funciona', NULL, true, 10),
('tech_link_quebrado', 'link nao funciona', NULL, true, 10),
('tech_link_quebrado', 'link quebrado', NULL, true, 10),
('tech_link_quebrado', 'link não abre', NULL, true, 10),
('tech_link_quebrado', 'link nao abre', NULL, true, 10),
('tech_link_quebrado', 'página não carrega', NULL, true, 10),
('tech_link_quebrado', 'pagina nao carrega', NULL, true, 10),
('tech_link_quebrado', 'erro na página', NULL, true, 10),
('tech_link_quebrado', 'erro na pagina', NULL, true, 10),
('tech_link_quebrado', 'não consigo acessar', NULL, true, 10),
('tech_link_quebrado', 'nao consigo acessar', NULL, true, 10),
('tech_link_quebrado', 'site fora', NULL, true, 10),
('tech_link_quebrado', 'página em branco', NULL, true, 10),
('tech_link_quebrado', 'pagina em branco', NULL, true, 10),
('tech_link_quebrado', 'não abre', NULL, true, 10),
('tech_link_quebrado', 'nao abre', NULL, true, 10),
('tech_link_quebrado', 'deu erro', NULL, true, 10),
('tech_link_quebrado', 'link errado', NULL, true, 10),
('tech_link_quebrado', 'link não funcinou', NULL, true, 10),
('tech_link_quebrado', 'link nao funcinou', NULL, true, 10),
('tech_link_quebrado', 'link com problema', NULL, true, 10),
('tech_link_quebrado', 'não tá abrindo', NULL, true, 10),
('tech_link_quebrado', 'nao ta abrindo', NULL, true, 10),
('tech_link_quebrado', 'não está abrindo', NULL, true, 10),
('tech_link_quebrado', 'nao esta abrindo', NULL, true, 10),
('tech_link_quebrado', 'proposta não abre', NULL, true, 10),
('tech_link_quebrado', 'proposta nao abre', NULL, true, 10),
('tech_link_quebrado', 'não carrega', NULL, true, 10),
('tech_link_quebrado', 'nao carrega', NULL, true, 10),
-- Email Not Received keywords
('tech_email_nao_recebido', 'não recebi o email', NULL, true, 10),
('tech_email_nao_recebido', 'nao recebi o email', NULL, true, 10),
('tech_email_nao_recebido', 'não recebi email', NULL, true, 10),
('tech_email_nao_recebido', 'nao recebi email', NULL, true, 10),
('tech_email_nao_recebido', 'email não chegou', NULL, true, 10),
('tech_email_nao_recebido', 'email nao chegou', NULL, true, 10),
('tech_email_nao_recebido', 'não chegou no email', NULL, true, 10),
('tech_email_nao_recebido', 'nao chegou no email', NULL, true, 10),
('tech_email_nao_recebido', 'não veio no email', NULL, true, 10),
('tech_email_nao_recebido', 'nao veio no email', NULL, true, 10),
('tech_email_nao_recebido', 'cadê o email', NULL, true, 10),
('tech_email_nao_recebido', 'cade o email', NULL, true, 10),
('tech_email_nao_recebido', 'email não veio', NULL, true, 10),
('tech_email_nao_recebido', 'email nao veio', NULL, true, 10),
('tech_email_nao_recebido', 'não recebi nada', NULL, true, 10),
('tech_email_nao_recebido', 'nao recebi nada', NULL, true, 10),
('tech_email_nao_recebido', 'não chegou nenhum email', NULL, true, 10),
('tech_email_nao_recebido', 'nao chegou nenhum email', NULL, true, 10),
('tech_email_nao_recebido', 'olhei o spam', NULL, true, 10),
('tech_email_nao_recebido', 'verifiquei spam', NULL, true, 10),
('tech_email_nao_recebido', 'não tem no spam', NULL, true, 10),
('tech_email_nao_recebido', 'nao tem no spam', NULL, true, 10),
('tech_email_nao_recebido', 'email sumiu', NULL, true, 10),
-- PDF Not Loading keywords
('tech_pdf_nao_carrega', 'pdf não abre', NULL, true, 10),
('tech_pdf_nao_carrega', 'pdf nao abre', NULL, true, 10),
('tech_pdf_nao_carrega', 'pdf não carrega', NULL, true, 10),
('tech_pdf_nao_carrega', 'pdf nao carrega', NULL, true, 10),
('tech_pdf_nao_carrega', 'pdf corrompido', NULL, true, 10),
('tech_pdf_nao_carrega', 'pdf com erro', NULL, true, 10),
('tech_pdf_nao_carrega', 'pdf em branco', NULL, true, 10),
('tech_pdf_nao_carrega', 'pdf vazio', NULL, true, 10),
('tech_pdf_nao_carrega', 'documento não abre', NULL, true, 10),
('tech_pdf_nao_carrega', 'documento nao abre', NULL, true, 10),
('tech_pdf_nao_carrega', 'não consigo ver o pdf', NULL, true, 10),
('tech_pdf_nao_carrega', 'nao consigo ver o pdf', NULL, true, 10),
('tech_pdf_nao_carrega', 'pdf bugado', NULL, true, 10),
('tech_pdf_nao_carrega', 'pdf travado', NULL, true, 10),
('tech_pdf_nao_carrega', 'pdf não funciona', NULL, true, 10),
-- Contract Not Received keywords
('tech_contrato_nao_chegou', 'contrato não chegou', NULL, true, 10),
('tech_contrato_nao_chegou', 'contrato nao chegou', NULL, true, 10),
('tech_contrato_nao_chegou', 'não recebi o contrato', NULL, true, 10),
('tech_contrato_nao_chegou', 'nao recebi o contrato', NULL, true, 10),
('tech_contrato_nao_chegou', 'cadê o contrato', NULL, true, 10),
('tech_contrato_nao_chegou', 'cade o contrato', NULL, true, 10),
('tech_contrato_nao_chegou', 'contrato não veio', NULL, true, 10),
('tech_contrato_nao_chegou', 'contrato nao veio', NULL, true, 10),
('tech_contrato_nao_chegou', 'aguardando contrato', NULL, true, 10),
('tech_contrato_nao_chegou', 'esperando o contrato', NULL, true, 10),
('tech_contrato_nao_chegou', 'contrato sumiu', NULL, true, 10),
('tech_contrato_nao_chegou', 'quando vem o contrato', NULL, true, 10),
('tech_contrato_nao_chegou', 'quero assinar', NULL, true, 10),
('tech_contrato_nao_chegou', 'ainda não assinei', NULL, true, 10),
('tech_contrato_nao_chegou', 'ainda nao assinei', NULL, true, 10),
-- Document Complaint keywords
('tech_document_complaint', 'já enviei', NULL, true, 10),
('tech_document_complaint', 'ja enviei', NULL, true, 10),
('tech_document_complaint', 'já mandei', NULL, true, 10),
('tech_document_complaint', 'ja mandei', NULL, true, 10),
('tech_document_complaint', 'já te mandei', NULL, true, 10),
('tech_document_complaint', 'ja te mandei', NULL, true, 10),
('tech_document_complaint', 'mandei a fatura', NULL, true, 10),
('tech_document_complaint', 'enviei a fatura', NULL, true, 10),
('tech_document_complaint', 'mandei o documento', NULL, true, 10),
('tech_document_complaint', 'enviei o documento', NULL, true, 10),
('tech_document_complaint', 'já passei', NULL, true, 10),
('tech_document_complaint', 'ja passei', NULL, true, 10),
('tech_document_complaint', 'passei a fatura', NULL, true, 10),
('tech_document_complaint', 'passei o documento', NULL, true, 10),
('tech_document_complaint', 'você já tem', NULL, true, 10),
('tech_document_complaint', 'voce ja tem', NULL, true, 10),
('tech_document_complaint', 'vocês já tem', NULL, true, 10),
('tech_document_complaint', 'voces ja tem', NULL, true, 10),
('tech_document_complaint', 'não preciso mandar', NULL, true, 10),
('tech_document_complaint', 'nao preciso mandar', NULL, true, 10),
('tech_document_complaint', 'não preciso enviar', NULL, true, 10),
('tech_document_complaint', 'nao preciso enviar', NULL, true, 10),
('tech_document_complaint', 'de novo não', NULL, true, 10),
('tech_document_complaint', 'de novo nao', NULL, true, 10),
('tech_document_complaint', 'outra vez não', NULL, true, 10),
('tech_document_complaint', 'outra vez nao', NULL, true, 10),
-- Proposal Delay Complaint keywords
('tech_proposal_delay', 'cadê a proposta', NULL, true, 10),
('tech_proposal_delay', 'cade a proposta', NULL, true, 10),
('tech_proposal_delay', 'onde está a proposta', NULL, true, 10),
('tech_proposal_delay', 'onde esta a proposta', NULL, true, 10),
('tech_proposal_delay', 'cadê minha proposta', NULL, true, 10),
('tech_proposal_delay', 'cade minha proposta', NULL, true, 10),
('tech_proposal_delay', 'não recebi a proposta', NULL, true, 10),
('tech_proposal_delay', 'nao recebi a proposta', NULL, true, 10),
('tech_proposal_delay', 'ainda não recebi', NULL, true, 10),
('tech_proposal_delay', 'ainda nao recebi', NULL, true, 10),
('tech_proposal_delay', 'tô esperando', NULL, true, 10),
('tech_proposal_delay', 'to esperando', NULL, true, 10),
('tech_proposal_delay', 'estou esperando', NULL, true, 10),
('tech_proposal_delay', 'aguardando a proposta', NULL, true, 10),
('tech_proposal_delay', 'proposta não chegou', NULL, true, 10),
('tech_proposal_delay', 'proposta nao chegou', NULL, true, 10),
('tech_proposal_delay', 'quanto tempo', NULL, true, 10),
('tech_proposal_delay', 'demora quanto', NULL, true, 10),
('tech_proposal_delay', 'demora muito', NULL, true, 10),
('tech_proposal_delay', 'tá demorando', NULL, true, 10),
('tech_proposal_delay', 'ta demorando', NULL, true, 10),
('tech_proposal_delay', 'está demorando', NULL, true, 10),
('tech_proposal_delay', 'quando vem', NULL, true, 10),
('tech_proposal_delay', 'quando chega', NULL, true, 10),
('tech_proposal_delay', 'quando fica pronto', NULL, true, 10)
ON CONFLICT (category, pattern) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 3. TECHNICAL ISSUE RESOLUTION MESSAGES
-- ═══════════════════════════════════════════════════════════════

INSERT INTO sofia_message_templates (category, template_key, template_text, variables, is_active, priority) VALUES
-- Escalation message
('tech_issue', 'escalation_message', '{client_name}, peço desculpas pelo transtorno! 😔 Vou passar seu caso para a minha supervisora, a Chris, que vai resolver isso pra você pessoalmente. Ela entra em contato em breve, ok?', ARRAY['client_name'], true, 10),
('tech_issue', 'escalation_message_no_name', 'Peço desculpas pelo transtorno! 😔 Vou passar seu caso para a minha supervisora, a Chris, que vai resolver isso pra você pessoalmente. Ela entra em contato em breve, ok?', ARRAY[]::text[], true, 10),

-- Link regeneration messages (attempt 1)
('tech_issue', 'link_regen_attempt_1', '{client_name}, desculpa pelo inconveniente! 😅 Regenerei o link da sua proposta com um novo endereço:

📄 {link}

Tenta acessar agora? Qualquer coisa me avisa! 😊', ARRAY['client_name', 'link'], true, 10),
('tech_issue', 'link_regen_attempt_1_no_name', 'Desculpa pelo inconveniente! 😅 Regenerei o link da sua proposta:

📄 {link}

Tenta acessar agora? Qualquer coisa me avisa! 😊', ARRAY['link'], true, 10),

-- Link regeneration messages (attempt 2)
('tech_issue', 'link_regen_attempt_2', '{client_name}, vou tentar de outra forma! Gerei um link completamente novo:

📄 {link}

Se ainda não funcionar, posso te enviar por WhatsApp mesmo, ok? Me avisa! 📲', ARRAY['client_name', 'link'], true, 10),
('tech_issue', 'link_regen_attempt_2_no_name', 'Vou tentar de outra forma! Gerei um link completamente novo:

📄 {link}

Se ainda não funcionar, posso te enviar por WhatsApp mesmo, ok? Me avisa! 📲', ARRAY['link'], true, 10),

-- No proposal found message
('tech_issue', 'no_proposal_found', '{client_name}, não encontrei uma proposta vinculada a você ainda. Quer que eu gere uma nova proposta agora? Me passa seu consumo médio mensal (em kWh ou R$) e sua distribuidora que faço na hora! ⚡', ARRAY['client_name'], true, 10),
('tech_issue', 'no_proposal_found_no_name', 'Não encontrei uma proposta vinculada a você ainda. Quer que eu gere uma nova proposta agora? Me passa seu consumo médio mensal (em kWh ou R$) e sua distribuidora que faço na hora! ⚡', ARRAY[]::text[], true, 10),

-- Email verification (attempt 1)
('tech_issue', 'email_verify_attempt_1', '{client_name}, o email que tenho cadastrado é: *{email}*

Está correto? Às vezes cai na caixa de spam/lixo eletrônico. Dá uma olhadinha lá! 📧

Se preferir, posso te enviar o link da proposta aqui mesmo pelo WhatsApp! 📲', ARRAY['client_name', 'email'], true, 10),
('tech_issue', 'email_verify_attempt_1_no_name', 'O email que tenho cadastrado é: *{email}*

Está correto? Às vezes cai na caixa de spam/lixo eletrônico. Dá uma olhadinha lá! 📧

Se preferir, posso te enviar o link da proposta aqui mesmo pelo WhatsApp! 📲', ARRAY['email'], true, 10),

-- WhatsApp offer after email fail
('tech_issue', 'whatsapp_offer', '{client_name}, sem problemas! Segue o link da sua proposta direto aqui pelo WhatsApp:

📄 {link}

Assim não precisa de email! 😊', ARRAY['client_name', 'link'], true, 10),
('tech_issue', 'whatsapp_offer_no_name', 'Sem problemas! Segue o link da sua proposta direto aqui pelo WhatsApp:

📄 {link}

Assim não precisa de email! 😊', ARRAY['link'], true, 10),

-- No proposal for email flow
('tech_issue', 'email_no_proposal', '{client_name}, ainda não localizei uma proposta no seu nome. Vamos gerar uma nova? Me passa seu consumo médio e distribuidora! ⚡', ARRAY['client_name'], true, 10),
('tech_issue', 'email_no_proposal_no_name', 'Ainda não localizei uma proposta no seu nome. Vamos gerar uma nova? Me passa seu consumo médio e distribuidora! ⚡', ARRAY[]::text[], true, 10),

-- Contract status check
('tech_issue', 'contract_status_check', '{client_name}, vou verificar o status do seu contrato! 📋

O contrato é enviado depois que nossa equipe de backoffice analisa os documentos. Às vezes pode demorar algumas horas úteis.

Quer que eu verifique em que etapa está? Me confirma seu nome completo e CPF/CNPJ para eu consultar! 🔍', ARRAY['client_name'], true, 10),
('tech_issue', 'contract_status_check_no_name', 'Vou verificar o status do seu contrato! 📋

O contrato é enviado depois que nossa equipe de backoffice analisa os documentos. Às vezes pode demorar algumas horas úteis.

Quer que eu verifique em que etapa está? Me confirma seu nome completo e CPF/CNPJ para eu consultar! 🔍', ARRAY[]::text[], true, 10),

-- Generic issue message
('tech_issue', 'generic_issue', '{client_name}, me conta melhor o que está acontecendo? Assim posso te ajudar da melhor forma! 🤔', ARRAY['client_name'], true, 10),
('tech_issue', 'generic_issue_no_name', 'Me conta melhor o que está acontecendo? Assim posso te ajudar da melhor forma! 🤔', ARRAY[]::text[], true, 10),

-- Typo suggestion message
('typo', 'suggestion_message', 'Hmm, você digitou "*{typo_detected}*"... Você quis dizer *{suggested}*? 🤔', ARRAY['typo_detected', 'suggested'], true, 10),

-- Typo rejection clarification
('typo', 'rejection_clarify', 'Desculpa, não consegui identificar sua distribuidora. 🤔

Qual é o nome que aparece na sua conta de luz? (Ex: *CEMIG*, *COELBA*, *CPFL Paulista*...)', ARRAY[]::text[], true, 10)
ON CONFLICT (category, template_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 4. DISQUALIFICATION THRESHOLDS AND SYSTEM CONSTANTS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('consumo_minimo_kwh', '200', 'Consumo mínimo em kWh para atendimento'),
('consumo_minimo_reais', '150', 'Valor mínimo da conta em R$ para atendimento'),
('estados_atendidos', 'MG,BA,SP,RJ', 'Estados atendidos (separados por vírgula)'),
('human_cooldown_ms', '30000', 'Tempo de cooldown após intervenção humana (em ms)'),
('zapi_max_retries', '3', 'Número máximo de tentativas de envio Z-API'),
('zapi_retry_delays', '1000,2000,4000', 'Delays de retry para Z-API (em ms, separados por vírgula)'),
('zapi_max_message_length', '4000', 'Tamanho máximo de mensagem Z-API'),
('llm_default_models', 'google/gemini-3-flash-preview,google/gemini-2.5-flash', 'Modelos LLM padrão com fallback (separados por vírgula)'),
('llm_gateway_url', 'https://ai.gateway.lovable.dev/v1/chat/completions', 'URL do gateway de IA'),
('operator_cmd_reset', '#RESET_TESTE', 'Comando de reset de conversa'),
('operator_cmd_status', '#STATUS_TESTE', 'Comando de status da conversa'),
('operator_cmd_ping', '#PING_TESTE', 'Comando de ping/health check'),
('operator_cmd_voice', '#VOZ_TESTE', 'Comando de teste de voz'),
('operator_cmd_help', '#AJUDA', 'Comando de ajuda'),
('operator_cmd_takeover', '#ASSUMIR,#MEU,#TAKEOVER', 'Comandos de takeover (separados por vírgula)'),
('operator_cmd_return', '#RESOLVIDO,#DEVOLVER,#SOFIA', 'Comandos de devolução (separados por vírgula)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, descricao = EXCLUDED.descricao;