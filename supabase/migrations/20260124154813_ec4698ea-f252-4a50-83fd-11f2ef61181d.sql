-- ═══════════════════════════════════════════════════════════════
-- ZERO HARDCODE PHASE 13: Detection patterns para economy simulator
-- ═══════════════════════════════════════════════════════════════

INSERT INTO sofia_detection_patterns (category, pattern_type, pattern, description, priority, is_active) VALUES
  ('economy_simulation', 'keyword', 'qual desconto', 'Pergunta sobre desconto', 80, true),
  ('economy_simulation', 'keyword', 'qual seria', 'Pergunta hipotética sobre valor', 70, true),
  ('economy_simulation', 'keyword', 'quanto economizo', 'Pergunta sobre economia', 90, true),
  ('economy_simulation', 'keyword', 'quanto vou economizar', 'Pergunta sobre economia futura', 90, true),
  ('economy_simulation', 'keyword', 'quanto economizaria', 'Pergunta condicional economia', 85, true),
  ('economy_simulation', 'keyword', 'minha economia', 'Referência a economia pessoal', 80, true),
  ('economy_simulation', 'keyword', 'meu desconto', 'Referência a desconto pessoal', 80, true),
  ('economy_simulation', 'keyword', 'calcula pra mim', 'Solicitação de cálculo', 85, true),
  ('economy_simulation', 'keyword', 'calcular economia', 'Solicitação de cálculo economia', 85, true),
  ('economy_simulation', 'keyword', 'simular', 'Palavra simular', 90, true),
  ('economy_simulation', 'keyword', 'simulação', 'Palavra simulação', 90, true),
  ('economy_simulation', 'keyword', 'quanto pago', 'Pergunta sobre valor a pagar', 75, true),
  ('economy_simulation', 'keyword', 'quanto pagaria', 'Pergunta condicional pagamento', 75, true),
  ('economy_simulation', 'keyword', 'quanto fico pagando', 'Pergunta sobre valor final', 75, true),
  ('economy_value_context', 'regex', 'R\\$|reais|\\d+\\s*kwh|conta\\s+de|pago\\s+\\d|fatura|valor', 'Contexto de valor monetário ou consumo', 100, true),
  ('economy_bill_extract', 'regex', 'R\\$\\s*(\\d+(?:[.,]\\d{2})?)', 'Extração de valor R$', 100, true),
  ('economy_bill_extract', 'regex', '(\\d+(?:[.,]\\d{2})?)\\s*reais', 'Extração de valor em reais', 95, true),
  ('economy_bill_extract', 'regex', 'conta\\s+(?:de\\s+)?(?:R\\$\\s*)?(\\d+(?:[.,]\\d{2})?)', 'Extração conta de X', 90, true),
  ('economy_bill_extract', 'regex', 'pago\\s+(?:R\\$\\s*)?(\\d+(?:[.,]\\d{2})?)', 'Extração pago X', 90, true),
  ('economy_bill_extract', 'regex', 'fatura\\s+(?:de\\s+)?(?:R\\$\\s*)?(\\d+(?:[.,]\\d{2})?)', 'Extração fatura de X', 90, true),
  ('economy_bill_extract', 'regex', 'gasto\\s+(?:R\\$\\s*)?(\\d+(?:[.,]\\d{2})?)', 'Extração gasto X', 85, true),
  ('economy_bill_extract', 'regex', 'valor\\s+(?:de\\s+)?(?:R\\$\\s*)?(\\d+(?:[.,]\\d{2})?)', 'Extração valor de X', 85, true),
  ('economy_bill_extract', 'regex', '(\\d{3,4})\\s*(?:por\\s+m[eê]s|mensal|\\/m[eê]s)', 'Extração valor mensal', 80, true),
  ('economy_consumption_extract', 'regex', '(\\d+)\\s*kwh', 'Extração consumo kWh', 100, true),
  ('economy_consumption_extract', 'regex', 'consumo\\s+(?:de\\s+)?(\\d+)', 'Extração consumo de X', 95, true),
  ('economy_consumption_extract', 'regex', '(\\d+)\\s*quilowatts?', 'Extração quilowatts', 90, true)
ON CONFLICT (category, pattern) DO UPDATE SET pattern_type = EXCLUDED.pattern_type, description = EXCLUDED.description, priority = EXCLUDED.priority;