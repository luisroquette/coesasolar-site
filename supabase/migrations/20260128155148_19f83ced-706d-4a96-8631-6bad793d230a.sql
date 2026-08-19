-- Insert guided script message templates
INSERT INTO sofia_message_templates (category, template_key, template_text, variables, is_active, priority) VALUES
-- Guided Script Redirects
('guided_script', 'off_script_redirect', '{cliente_nome}, ótima pergunta! Vou guardar essa dúvida para responder daqui a pouco. 😊

Antes, preciso que você {current_step_action}. Assim consigo avançar com sua proposta!', ARRAY['cliente_nome', 'current_step_action'], true, 100),

('guided_script', 'email_required', '{cliente_nome}, para preparar sua proposta personalizada, preciso primeiro do seu *e-mail*! 📧

Assim você recebe todos os detalhes da economia. Qual é o seu e-mail?', ARRAY['cliente_nome'], true, 100),

('guided_script', 'docs_platform_required', '{cliente_nome}, para sua *segurança*, os documentos devem ser enviados pelo link da proposta! 🔒

📎 Acesse aqui: {proposal_url}

Clique em "Quero minha Proposta Definitiva" para anexar os arquivos.', ARRAY['cliente_nome', 'proposal_url'], true, 100),

('guided_script', 'contract_pending_docs', '{cliente_nome}, para gerar seu contrato, preciso primeiro que você envie os documentos pelo link! 📋

📎 Acesse: {proposal_url}

Assim que receber tudo, preparo seu contrato rapidinho! 😊', ARRAY['cliente_nome', 'proposal_url'], true, 100),

('guided_script', 'proposal_first', '{cliente_nome}, primeiro vou preparar sua *proposta inicial* com a simulação de economia! 📊

Para isso, preciso saber: qual o *valor médio* da sua conta de luz e qual a sua *distribuidora*?', ARRAY['cliente_nome'], true, 100),

('guided_script', 'signature_pending', '{cliente_nome}, seu contrato já está pronto! 📋

📎 Acesse aqui para assinar: {contract_url}

Qualquer dúvida antes de assinar, estou aqui! 😊', ARRAY['cliente_nome', 'contract_url'], true, 100),

('guided_script', 'data_required', '{cliente_nome}, para preparar sua proposta, preciso de algumas informações:

📧 Seu e-mail
💡 Valor médio da conta de luz
⚡ Sua distribuidora de energia

Pode me passar?', ARRAY['cliente_nome'], true, 100),

('guided_script', 'docs_required', '{cliente_nome}, para gerar sua proposta definitiva, preciso que você envie os documentos pelo link! 📋

📎 Acesse: {proposal_url}', ARRAY['cliente_nome', 'proposal_url'], true, 100),

('guided_script', 'qualification_required', '{cliente_nome}, me conta: qual é o valor médio da sua conta de luz? 💡

Assim consigo calcular sua economia!', ARRAY['cliente_nome'], true, 100),

('guided_script', 'triagem_required', 'Olá! 👋 Sou a sofIA, assistente virtual da COESA. Você já é cliente ou está conhecendo nosso serviço de energia por assinatura?', ARRAY[]::TEXT[], true, 100),

('guided_script', 'proposal_pending', '{cliente_nome}, sua proposta está sendo preparada! ✨

Assim que o link estiver pronto, te envio aqui. Aguarde só mais um pouquinho! 😊', ARRAY['cliente_nome'], true, 100),

('guided_script', 'contract_pending', '{cliente_nome}, estamos preparando seu contrato! 📝

Assim que estiver pronto, te envio o link para assinatura. Aguarde! 😊', ARRAY['cliente_nome'], true, 100),

('guided_script', 'skip_attempt', '{cliente_nome}, ótima pergunta! 😊 Mas antes de avançar, preciso que você {current_step_action}.

Assim garanto que sua proposta fique perfeita!', ARRAY['cliente_nome', 'current_step_action'], true, 100)

ON CONFLICT (category, template_key) DO UPDATE SET 
  template_text = EXCLUDED.template_text,
  variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active;

-- Insert guided script configuration flags
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('guided_script_enabled', 'true', 'Habilita modo roteiro guiado (FSM)'),
  ('guided_script_strict_mode', 'true', 'Modo estrito: bloqueia qualquer desvio do roteiro'),
  ('guided_script_allow_faq_mid_flow', 'true', 'Permite responder FAQs sem redirecionar'),
  ('guided_script_log_all_transitions', 'true', 'Loga todas as transições de estado')
ON CONFLICT (chave) DO NOTHING;