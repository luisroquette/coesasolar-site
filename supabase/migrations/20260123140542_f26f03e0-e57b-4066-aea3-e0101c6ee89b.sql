-- ═══════════════════════════════════════════════════════════════
-- ZERO HARDCODE PHASE 7B: Disqualification + Z-API fallbacks
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. DISQUALIFICATION MESSAGE TEMPLATES (fallbacks)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO sofia_message_templates (category, template_key, template_text, variables, description)
VALUES
-- Grupo A
('disqualification', 'grupo_a', 'Infelizmente não atendemos clientes do Grupo A (alta tensão). Nosso serviço é voltado para Grupo B (residencial/comercial baixa tensão).', '{}', 'Mensagem de desqualificação para clientes Grupo A'),

-- Tarifa Social
('disqualification', 'tarifa_social', 'Infelizmente não podemos atender clientes com Tarifa Social/Baixa Renda, pois vocês já possuem um desconto especial do governo.', '{}', 'Mensagem de desqualificação para clientes com tarifa social'),

-- Consumo Baixo
('disqualification', 'consumo_baixo', 'Seu consumo está abaixo do mínimo necessário para que nossa economia faça sentido. Recomendamos a partir de {consumo_minimo_kwh} kWh ou R$ {consumo_minimo_reais}/mês.', '{consumo_minimo_kwh,consumo_minimo_reais}', 'Mensagem de desqualificação para consumo baixo'),

-- Área Não Atendida
('disqualification', 'area_nao_atendida', 'Infelizmente ainda não atendemos sua região. Atualmente operamos em {estados_atendidos}.', '{estados_atendidos}', 'Mensagem de desqualificação para área não atendida'),

-- Geração Própria
('disqualification', 'geracao_propria', 'Se você já possui painéis solares instalados, nosso serviço não é compatível. Atendemos apenas quem ainda não tem geração própria.', '{}', 'Mensagem de desqualificação para quem já tem painel solar')

ON CONFLICT (category, template_key) DO UPDATE SET
  template_text = EXCLUDED.template_text,
  variables = EXCLUDED.variables,
  description = EXCLUDED.description,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════
-- 2. Z-API / SYSTEM CONFIGURATION CONSTANTS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES
('zapi_audio_announcement_keywords', '["te mando","vou mandar","vou te mandar","te envio","vou enviar","enviando","mandando","gravando"]', 'Palavras que indicam anúncio de áudio (removidas antes do TTS)')
ON CONFLICT (chave) DO UPDATE SET
  valor = EXCLUDED.valor,
  descricao = EXCLUDED.descricao,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════
-- 3. AUDIO ANNOUNCEMENT PATTERNS (for detection)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, description, is_active)
VALUES
('audio_announcement', 'te mando', 'keyword', 100, 'Detecta anúncio de envio de áudio', true),
('audio_announcement', 'vou mandar', 'keyword', 100, 'Detecta anúncio de envio de áudio', true),
('audio_announcement', 'vou te mandar', 'keyword', 100, 'Detecta anúncio de envio de áudio', true),
('audio_announcement', 'te envio', 'keyword', 100, 'Detecta anúncio de envio de áudio', true),
('audio_announcement', 'vou enviar', 'keyword', 100, 'Detecta anúncio de envio de áudio', true),
('audio_announcement', 'enviando', 'keyword', 100, 'Detecta anúncio de envio de áudio', true),
('audio_announcement', 'mandando', 'keyword', 100, 'Detecta anúncio de envio de áudio', true),
('audio_announcement', 'gravando', 'keyword', 100, 'Detecta anúncio de envio de áudio', true)
ON CONFLICT DO NOTHING;