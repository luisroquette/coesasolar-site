-- PHASE 3: Insert detection patterns for temporary desistance objection
-- Category: objection_desistencia_temporaria
-- These patterns detect when client wants to postpone/desist temporarily

INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, is_active, response_template)
VALUES 
  ('objection_desistencia_temporaria', 'neste momento não', 'keyword', 90, true, 'Sem problemas! Fico aqui quando precisar. É só mandar um "oi" que a gente retoma! 💚'),
  ('objection_desistencia_temporaria', 'neste momento nao', 'keyword', 90, true, NULL),
  ('objection_desistencia_temporaria', 'agora não vou', 'keyword', 90, true, NULL),
  ('objection_desistencia_temporaria', 'agora nao vou', 'keyword', 90, true, NULL),
  ('objection_desistencia_temporaria', 'no momento não', 'keyword', 90, true, NULL),
  ('objection_desistencia_temporaria', 'no momento nao', 'keyword', 90, true, NULL),
  ('objection_desistencia_temporaria', 'não quero agora', 'keyword', 90, true, NULL),
  ('objection_desistencia_temporaria', 'nao quero agora', 'keyword', 90, true, NULL),
  ('objection_desistencia_temporaria', 'não vou agora', 'keyword', 90, true, NULL),
  ('objection_desistencia_temporaria', 'nao vou agora', 'keyword', 90, true, NULL),
  ('objection_desistencia_temporaria', 'depois vejo', 'keyword', 85, true, NULL),
  ('objection_desistencia_temporaria', 'outra hora', 'keyword', 85, true, NULL),
  ('objection_desistencia_temporaria', 'não por agora', 'keyword', 85, true, NULL),
  ('objection_desistencia_temporaria', 'nao por agora', 'keyword', 85, true, NULL),
  ('objection_desistencia_temporaria', 'vou pensar', 'keyword', 80, true, NULL),
  ('objection_desistencia_temporaria', 'deixa pra depois', 'keyword', 80, true, NULL),
  ('objection_desistencia_temporaria', 'deixa para depois', 'keyword', 80, true, NULL)
ON CONFLICT DO NOTHING;