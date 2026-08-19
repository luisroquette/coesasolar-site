-- ═══════════════════════════════════════════════════════════════
-- PADRÕES DE DETECÇÃO: Contexto de Terceiros
-- Usados para bypass de triagem quando cliente menciona UC de parente
-- ═══════════════════════════════════════════════════════════════

INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, description, is_active) VALUES
  -- Contexto de terceiros direto
  ('triage_third_party', 'casa do sogro', 'keyword', 100, 'UC de terceiro - sogro', true),
  ('triage_third_party', 'casa da sogra', 'keyword', 100, 'UC de terceiro - sogra', true),
  ('triage_third_party', 'casa do meu sogro', 'keyword', 100, 'UC de terceiro - sogro', true),
  ('triage_third_party', 'casa da minha sogra', 'keyword', 100, 'UC de terceiro - sogra', true),
  ('triage_third_party', 'casa do meu pai', 'keyword', 100, 'UC de parente - pai', true),
  ('triage_third_party', 'casa da minha mae', 'keyword', 100, 'UC de parente - mãe', true),
  ('triage_third_party', 'casa da minha mãe', 'keyword', 100, 'UC de parente - mãe acentuado', true),
  ('triage_third_party', 'conta do marido', 'keyword', 100, 'UC de cônjuge - marido', true),
  ('triage_third_party', 'conta da esposa', 'keyword', 100, 'UC de cônjuge - esposa', true),
  ('triage_third_party', 'na casa dele', 'keyword', 95, 'Referência a terceiro masculino', true),
  ('triage_third_party', 'na casa dela', 'keyword', 95, 'Referência a terceiro feminino', true),
  ('triage_third_party', 'tem na casa de', 'keyword', 95, 'UC alternativa mencionada', true),
  
  -- Contexto comercial implícito (cliente informando valor)
  ('triage_third_party', 'vem em media', 'keyword', 90, 'Fornecendo valor médio - contexto comercial', true),
  ('triage_third_party', 'vem em média', 'keyword', 90, 'Fornecendo valor médio acentuado', true),
  ('triage_third_party', 'media de r$', 'keyword', 95, 'Valor médio informado', true),
  ('triage_third_party', 'média de r$', 'keyword', 95, 'Valor médio informado acentuado', true),
  ('triage_third_party', 'a conta e de', 'keyword', 90, 'Referência a terceiro possível', true),
  ('triage_third_party', 'a conta é de', 'keyword', 90, 'Referência a terceiro acentuado', true),
  
  -- Respostas de triagem por extenso
  ('confirm_new', 'dois', 'keyword', 100, 'Resposta 2 por extenso', true),
  ('confirm_new', 'não sou cliente', 'keyword', 100, 'Confirmação explícita não cliente', true),
  ('confirm_new', 'nao sou cliente', 'keyword', 100, 'Confirmação sem acento', true),
  ('confirm_new', 'ainda não sou', 'keyword', 95, 'Ainda não é cliente', true),
  ('confirm_new', 'ainda nao sou', 'keyword', 95, 'Sem acento', true),
  ('confirm_existing', 'um', 'keyword', 100, 'Resposta 1 por extenso', true),
  ('confirm_existing', 'já sou cliente', 'keyword', 100, 'Confirmação explícita cliente', true),
  ('confirm_existing', 'ja sou cliente', 'keyword', 100, 'Sem acento', true)
ON CONFLICT (category, pattern) DO UPDATE 
SET priority = EXCLUDED.priority, 
    description = EXCLUDED.description, 
    is_active = true,
    updated_at = now();

-- ═══════════════════════════════════════════════════════════════
-- CONFIGURAÇÕES DE SEGURANÇA
-- ═══════════════════════════════════════════════════════════════

INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('whatsapp_document_reception_enabled', 'false', 'Se true, aceita documentos pessoais via WhatsApp. Se false, redireciona para plataforma segura'),
  ('proposal_requires_verified_email', 'true', 'Se true, bloqueia geração de proposta sem email válido coletado'),
  ('minimum_bill_estimation_rate', '0.80', 'Taxa R$/kWh usada para estimar valor da conta quando só temos consumo'),
  ('regression_tests_notify_on_failure', 'true', 'Se true, notifica admins quando testes de regressão falham')
ON CONFLICT (chave) DO NOTHING;