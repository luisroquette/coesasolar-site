-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: Triage Contextual Clarification Patterns
-- Move ambiguous patterns from existing_client to contextual_clarification
-- ═══════════════════════════════════════════════════════════════

-- 1. Create new category 'contextual_clarification' for ambiguous patterns
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, is_active, response_template)
VALUES 
  ('contextual_clarification', 'andamento', 'keyword', 10, true, NULL),
  ('contextual_clarification', 'minha situação', 'keyword', 10, true, NULL),
  ('contextual_clarification', 'minha situacao', 'keyword', 10, true, NULL),
  ('contextual_clarification', 'como está', 'keyword', 10, true, NULL),
  ('contextual_clarification', 'como esta', 'keyword', 10, true, NULL),
  ('contextual_clarification', 'status do meu', 'keyword', 10, true, NULL),
  ('contextual_clarification', 'quero saber sobre', 'keyword', 10, true, NULL),
  ('contextual_clarification', 'sobre o meu', 'keyword', 10, true, NULL)
ON CONFLICT DO NOTHING;

-- 2. Deactivate these patterns in existing_client to prevent false positives
UPDATE sofia_detection_patterns 
SET is_active = false 
WHERE category = 'existing_client' 
  AND pattern IN ('andamento', 'minha situação', 'minha situacao', 'status do meu', 'como está', 'como esta');