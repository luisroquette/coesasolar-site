-- ═══════════════════════════════════════════════════════════════
-- Zero Hardcode Fase 5C: Mensagens Operator/Takeover completas
-- Migra generateHelpMessage, generateTakeoverConfirmation, etc.
-- ═══════════════════════════════════════════════════════════════

-- 1. HELP MESSAGE (multi-section)
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, is_active, description) VALUES
  ('operator', 'help', 'help_header', '📋 *COMANDOS DISPONÍVEIS*', ARRAY[]::text[], true, 'Header do help'),
  ('operator', 'help', 'help_test_section', E'🔧 *Comandos de Teste:*\n\n• *#PING_TESTE* - Verifica se a sofIA está online e funcionando\n\n• *#STATUS_TESTE* - Mostra o estado atual da sua conversa (lead score, dados coletados, etc.)\n\n• *#VOZ_TESTE* - Testa a voz da sofIA (envia um áudio de exemplo)\n\n• *#RESET_TESTE* - Limpa todos os dados da conversa para começar do zero', ARRAY[]::text[], true, 'Seção de comandos de teste'),
  ('operator', 'help', 'help_attendant_section', E'👤 *Comandos de Atendimento:*\n\n• *#ASSUMIR <telefone>* - Assume o cliente pelo telefone\n  Ex: #ASSUMIR 31999999999\n  _Aliases: #MEU, #TAKEOVER_\n\n• *#RESOLVIDO <telefone>* - Devolve cliente específico para a sofIA\n  Ex: #RESOLVIDO 31999999999\n  _Aliases: #DEVOLVER, #SOFIA_\n\n• *#RESOLVIDO* (sem telefone) - Devolve todos os seus atendimentos', ARRAY[]::text[], true, 'Seção de comandos de atendente'),
  ('operator', 'help', 'help_footer', E'⚠️ *Importante:* Atendentes precisam estar cadastrados.\n💡 _Use o telefone com DDD, sem o 55._', ARRAY[]::text[], true, 'Rodapé do help')
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, is_active = true;

-- 2. TAKEOVER CONFIRMATION
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, is_active, description) VALUES
  ('operator', 'takeover', 'takeover_confirmation', E'✅ *Atendimento Assumido*\n\n👤 Cliente: {client_name}\n📱 Telefone: {phone}\n\nA sofIA parou de responder. Você pode falar diretamente com o cliente.\n\n_Use {return_cmd} para devolver._', ARRAY['client_name', 'phone', 'return_cmd']::text[], true, 'Confirmação de takeover para atendente')
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, is_active = true;

-- 3. RETURN CONFIRMATION
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, is_active, description) VALUES
  ('operator', 'return', 'return_confirmation', E'✅ *Atendimento Devolvido*\n\n👤 Cliente: {client_name}\n📱 Telefone: {phone}\n⏱️ Tempo de atendimento: {time_minutes} min\n\nA {agent_name} voltou a responder automaticamente.', ARRAY['client_name', 'phone', 'time_minutes', 'agent_name']::text[], true, 'Confirmação de devolução para atendente')
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, is_active = true;

-- 4. BULK RETURN CONFIRMATION
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, is_active, description) VALUES
  ('operator', 'return', 'bulk_return_confirmation', E'✅ *Atendimentos Devolvidos*\n\nDevolvidos para a {agent_name}:\n{clients_list}\n\nTotal: {count} cliente(s)', ARRAY['agent_name', 'clients_list', 'count']::text[], true, 'Confirmação de devolução em massa')
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, is_active = true;

-- 5. FAREWELL MESSAGE (client)
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, is_active, description) VALUES
  ('operator', 'takeover', 'farewell_to_client', E'{client_name}, vou transferir seu atendimento para um especialista da equipe. Você está em boas mãos! 😊', ARRAY['client_name']::text[], true, 'Mensagem de despedida para cliente')
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, is_active = true;

-- 6. RETURN MESSAGE (client)
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, is_active, description) VALUES
  ('operator', 'return', 'return_to_client', E'Oi {client_name}! Sou a {agent_name} e voltei para continuar te ajudando. 😊\n\nVi que você estava conversando com {attendant_name}. Posso continuar de onde paramos!', ARRAY['client_name', 'agent_name', 'attendant_name']::text[], true, 'Mensagem de retorno para cliente')
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, is_active = true;

-- 7. NOT FOUND MESSAGE
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, is_active, description) VALUES
  ('operator', 'error', 'conversation_not_found', E'⚠️ Nenhuma conversa encontrada para o telefone {phone}.\n\nVerifique se o número está correto (com DDD, sem 55).', ARRAY['phone']::text[], true, 'Conversa não encontrada')
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, is_active = true;

-- 8. NO ESCALATED MESSAGE
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, is_active, description) VALUES
  ('operator', 'error', 'no_escalated_conversations', E'ℹ️ Você não tem atendimentos pausados no momento.\n\nUse #ASSUMIR <telefone> para assumir um cliente específico.', ARRAY[]::text[], true, 'Sem conversas escaladas')
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, is_active = true;

-- 9. SUPERVISOR NOTIFICATION
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, is_active, description) VALUES
  ('operator', 'notification', 'supervisor_notification', E'🔔 *Atendimento Assumido*\n\n👤 Atendente: {attendant_name}\n📱 Cliente: {client_name} ({phone})\n⏰ Horário: {timestamp}\n\n_Use #STATUS para acompanhar._', ARRAY['attendant_name', 'client_name', 'phone', 'timestamp']::text[], true, 'Notificação para supervisor')
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, is_active = true;

-- 10. Z-API WEBHOOK COMBINED MESSAGE
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, is_active, description) VALUES
  ('operator', 'takeover', 'takeover_combined', E'✅ *Atendimento assumido por humano*\n\n{client_name}, vou transferir seu atendimento para um especialista da equipe. Você está em boas mãos! 😊\n\n_{agent_name} pausada. Use #RESOLVIDO para reativar._', ARRAY['client_name', 'agent_name']::text[], true, 'Mensagem combinada do z-api-webhook')
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text, is_active = true;