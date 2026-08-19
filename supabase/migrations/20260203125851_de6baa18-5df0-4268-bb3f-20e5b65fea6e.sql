-- Drop the old constraint and add a new one with 'conversation_upload' included
ALTER TABLE rule_memory DROP CONSTRAINT rule_memory_learned_from_check;

ALTER TABLE rule_memory ADD CONSTRAINT rule_memory_learned_from_check 
CHECK (learned_from = ANY (ARRAY[
  'operator_correction'::text, 
  'explicit_config'::text, 
  'ml_inferred'::text, 
  'manual'::text, 
  'system'::text,
  'conversation_upload'::text
]));