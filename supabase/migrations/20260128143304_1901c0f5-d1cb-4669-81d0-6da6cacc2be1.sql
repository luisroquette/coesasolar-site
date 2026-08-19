-- ═══════════════════════════════════════════════════════════════
-- CORREÇÃO: Padrões para bloqueio comercial (casa do sogro, etc.)
-- ═══════════════════════════════════════════════════════════════

-- Adicionar padrões para bloquear triagem quando mencionam terceiros
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, description, is_active) VALUES
  ('commercial_context_blockers', 'conta do sogro', 'keyword', 100, 'Cliente menciona conta de terceiro', true),
  ('commercial_context_blockers', 'conta da sogra', 'keyword', 100, 'Cliente menciona conta de terceiro', true),
  ('commercial_context_blockers', 'casa do sogro', 'keyword', 100, 'Cliente menciona UC de terceiro', true),
  ('commercial_context_blockers', 'casa da sogra', 'keyword', 100, 'Cliente menciona UC de terceiro', true),
  ('commercial_context_blockers', 'tem na casa', 'keyword', 95, 'Cliente menciona UC alternativa', true),
  ('commercial_context_blockers', 'na casa dele', 'keyword', 95, 'Referência a terceiro', true),
  ('commercial_context_blockers', 'na casa dela', 'keyword', 95, 'Referência a terceiro', true),
  ('commercial_context_blockers', 'conta do meu pai', 'keyword', 100, 'Cliente menciona conta de parente', true),
  ('commercial_context_blockers', 'conta da minha mae', 'keyword', 100, 'Cliente menciona conta de parente', true),
  ('commercial_context_blockers', 'vem em media', 'keyword', 90, 'Cliente fornecendo valor de fatura', true),
  ('commercial_context_blockers', 'media de', 'keyword', 90, 'Cliente fornecendo valor de fatura', true),
  ('commercial_context_blockers', 'casa do meu pai', 'keyword', 100, 'Cliente menciona UC de parente', true),
  ('commercial_context_blockers', 'casa da minha mae', 'keyword', 100, 'Cliente menciona UC de parente', true),
  ('commercial_context_blockers', 'na casa do meu', 'keyword', 95, 'Referência a parente', true),
  ('commercial_context_blockers', 'na casa da minha', 'keyword', 95, 'Referência a parente', true),
  ('commercial_context_blockers', 'em media 1', 'keyword', 85, 'Cliente fornecendo valor numérico', true),
  ('commercial_context_blockers', 'em media 2', 'keyword', 85, 'Cliente fornecendo valor numérico', true),
  ('commercial_context_blockers', 'em media 3', 'keyword', 85, 'Cliente fornecendo valor numérico', true),
  ('commercial_context_blockers', 'em torno de r$', 'keyword', 90, 'Cliente fornecendo valor monetário', true),
  ('commercial_context_blockers', 'por volta de r$', 'keyword', 90, 'Cliente fornecendo valor monetário', true)
ON CONFLICT DO NOTHING;

-- Adicionar padrões para reconhecer respostas "2" e variantes como novo cliente
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, description, is_active) VALUES
  ('confirm_new', '2', 'keyword', 100, 'Resposta numérica: novo cliente', true),
  ('confirm_new', 'dois', 'keyword', 100, 'Resposta textual: dois', true),
  ('confirm_new', 'quero ser', 'keyword', 95, 'Cliente quer aderir', true),
  ('confirm_new', 'quero ser cliente', 'keyword', 100, 'Cliente quer ser cliente', true),
  ('confirm_new', 'ser cliente', 'keyword', 90, 'Cliente quer ser cliente', true),
  ('confirm_new', 'conhecer', 'keyword', 85, 'Cliente quer conhecer', true),
  ('confirm_new', 'novo cliente', 'keyword', 95, 'Novo cliente', true),
  ('confirm_new', 'nao sou', 'keyword', 90, 'Não é cliente', true),
  ('confirm_new', 'não sou', 'keyword', 90, 'Não é cliente', true),
  ('confirm_new', 'nunca fui', 'keyword', 95, 'Nunca foi cliente', true),
  ('confirm_new', 'primeira vez', 'keyword', 90, 'Primeira vez', true),
  ('confirm_new', 'ainda nao', 'keyword', 85, 'Ainda não é cliente', true),
  ('confirm_new', 'ainda não', 'keyword', 85, 'Ainda não é cliente', true),
  ('confirm_new', 'quero conhecer', 'keyword', 95, 'Quer conhecer o desconto', true),
  ('confirm_new', 'quero aderir', 'keyword', 100, 'Quer aderir ao programa', true),
  ('confirm_new', 'quero proposta', 'keyword', 95, 'Quer uma proposta', true),
  ('confirm_new', 'quero desconto', 'keyword', 90, 'Quer o desconto', true)
ON CONFLICT DO NOTHING;

-- Garantir que padrões existentes de confirm_existing estão corretos
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, description, is_active) VALUES
  ('confirm_existing', '1', 'keyword', 100, 'Resposta numérica: já cliente', true),
  ('confirm_existing', 'um', 'keyword', 100, 'Resposta textual: um', true),
  ('confirm_existing', 'ja sou', 'keyword', 95, 'Já é cliente', true),
  ('confirm_existing', 'já sou', 'keyword', 95, 'Já é cliente', true),
  ('confirm_existing', 'sou cliente', 'keyword', 100, 'Já é cliente', true),
  ('confirm_existing', 'ja sou cliente', 'keyword', 100, 'Já é cliente', true),
  ('confirm_existing', 'já sou cliente', 'keyword', 100, 'Já é cliente', true)
ON CONFLICT DO NOTHING;