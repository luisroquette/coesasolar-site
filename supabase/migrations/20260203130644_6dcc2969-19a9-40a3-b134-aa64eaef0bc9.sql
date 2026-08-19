-- Drop and recreate the learning_source constraint to include 'conversation_upload'
ALTER TABLE rule_memory DROP CONSTRAINT IF EXISTS rule_memory_learning_source_check;

ALTER TABLE rule_memory ADD CONSTRAINT rule_memory_learning_source_check 
CHECK (learning_source IS NULL OR learning_source = ANY (ARRAY[
  'operator_correction'::text, 
  'explicit_config'::text, 
  'ml_inferred'::text, 
  'manual'::text, 
  'system'::text,
  'conversation_upload'::text
]));