-- ZERO HARDCODE FASE 8: hesitation, discount-objection, audio-handler

-- 1. DETECTION PATTERNS
INSERT INTO sofia_detection_patterns (category, pattern_type, pattern, description, is_active, priority) VALUES
  ('complex_topic', 'keyword', 'como funciona', 'Tópico complexo', true, 50),
  ('complex_topic', 'keyword', 'explique', 'Tópico complexo', true, 50),
  ('complex_topic', 'keyword', 'passo a passo', 'Tópico complexo', true, 50),
  ('complex_topic', 'keyword', 'energia solar', 'Tópico complexo', true, 60),
  ('complex_topic', 'keyword', 'geração distribuída', 'Tópico complexo GD', true, 60),
  ('multiple_doubts', 'keyword', 'muitas dúvidas', 'Múltiplas dúvidas', true, 60),
  ('multiple_doubts', 'keyword', 'várias dúvidas', 'Múltiplas dúvidas', true, 60),
  ('multiple_doubts', 'keyword', 'tô confuso', 'Confusão', true, 55),
  ('multiple_doubts', 'keyword', 'estou perdido', 'Perdido', true, 55),
  ('multiple_doubts', 'keyword', 'me explica melhor', 'Pede explicação', true, 55)
ON CONFLICT (category, pattern) DO NOTHING;

-- 2. MESSAGE TEMPLATES
INSERT INTO sofia_message_templates (template_key, category, template_text, variables, description, is_active) VALUES
  ('audio_offer_multiple_doubts', 'audio', E'\n\n💡 _Vi que você tem várias dúvidas! Quer que eu te explique por áudio?_', '{}', 'Oferta áudio - dúvidas', true),
  ('audio_offer_complex_topic', 'audio', E'\n\n💡 _Esse assunto é técnico. Quer que eu explique por áudio?_', '{}', 'Oferta áudio - tópico complexo', true),
  ('audio_offer_long_response', 'audio', E'\n\n💡 _Quer que eu te explique por áudio?_', '{}', 'Oferta áudio - resposta longa', true),
  ('hesitation_analysis_prompt', 'ai_prompt', E'Analise se o cliente está hesitando. Responda JSON: {"hesitating": true/false, "confidence": "high"|"medium"|"low", "reason": "..."}', '{}', 'Prompt IA hesitação', true),
  ('discount_master_offer', 'discount', E'{greeting}entendi! Para consumos acima de {consumo_limite} kWh, temos o *Plano UNLOCK* com *{desconto_master}% de desconto*! 🔓', '{greeting,consumo_limite,desconto_master,fidelidade_master}', 'Oferta Master', true),
  ('discount_limit_explanation', 'discount', E'{greeting}entendo! Os {desconto_atual}% são o máximo para consumos até {consumo_limite} kWh. Economia de {economia_anual}/ano! 😊', '{greeting,desconto_atual,consumo_limite,economia_anual}', 'Limite desconto', true),
  ('economy_confirmation_response', 'discount', E'{greeting}isso mesmo! 🎉 Com {desconto}% você economiza ~{economia_mensal}/mês!', '{greeting,desconto,economia_mensal}', 'Confirmação economia', true)
ON CONFLICT (category, template_key) DO UPDATE SET template_text = EXCLUDED.template_text;

-- 3. SYSTEM CONFIGS
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('consumo_limite_master_kwh', '3000', 'Consumo mínimo para plano Master'),
  ('desconto_master_percentual', '30', 'Desconto plano Master'),
  ('fidelidade_master_anos', '4', 'Fidelidade plano Master'),
  ('hesitation_min_length_ai', '30', 'Min chars para IA hesitação'),
  ('hesitation_default_model', 'google/gemini-2.5-flash-lite', 'Modelo IA hesitação')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;