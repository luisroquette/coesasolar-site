-- =====================================================
-- FIX: Triagem falsa para assuntos comerciais
-- =====================================================

-- 1. REMOVER PATTERNS AMBÍGUOS de existing_client
DELETE FROM sofia_detection_patterns 
WHERE category = 'existing_client' 
AND pattern IN (
  'boleto', 'meu boleto', 'pagamento', 'pagar', 'vencimento', 
  'venceu', 'atraso', 'débito', 'debito', 'fatura atrasada',
  'não recebi o boleto', 'nao recebi o boleto', 'status',
  'segunda via', '2a via', '2ª via'
);

-- 2. CRIAR NOVA CATEGORIA: commercial_context_blockers
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, description, is_active)
SELECT * FROM (VALUES
  ('commercial_context_blockers', 'quero contratar', 'keyword', 100, 'Interesse comercial', true),
  ('commercial_context_blockers', 'quero aderir', 'keyword', 100, 'Interesse comercial', true),
  ('commercial_context_blockers', 'quero fechar', 'keyword', 100, 'Interesse comercial', true),
  ('commercial_context_blockers', 'vamos fechar', 'keyword', 100, 'Interesse comercial', true),
  ('commercial_context_blockers', 'bora fechar', 'keyword', 100, 'Interesse comercial', true),
  ('commercial_context_blockers', 'consegue desconto', 'keyword', 100, 'Negociação comercial', true),
  ('commercial_context_blockers', 'mais desconto', 'keyword', 100, 'Negociação comercial', true),
  ('commercial_context_blockers', 'qual o desconto', 'keyword', 100, 'Negociação comercial', true),
  ('commercial_context_blockers', 'melhor desconto', 'keyword', 100, 'Negociação comercial', true),
  ('commercial_context_blockers', 'tem algum custo', 'keyword', 100, 'Dúvida comercial', true),
  ('commercial_context_blockers', 'tem custo', 'keyword', 100, 'Dúvida comercial', true),
  ('commercial_context_blockers', 'preciso pagar', 'keyword', 100, 'Dúvida comercial', true),
  ('commercial_context_blockers', 'tem multa', 'keyword', 100, 'Dúvida comercial', true),
  ('commercial_context_blockers', 'minha conta de luz', 'keyword', 90, 'Contexto análise', true),
  ('commercial_context_blockers', 'valor da minha conta', 'keyword', 90, 'Contexto análise', true),
  ('commercial_context_blockers', 'quanto pago de luz', 'keyword', 90, 'Contexto análise', true),
  ('commercial_context_blockers', 'minha proposta', 'keyword', 100, 'Contexto comercial', true),
  ('commercial_context_blockers', 'fazer simulação', 'keyword', 100, 'Contexto comercial', true),
  ('commercial_context_blockers', 'quanto vou economizar', 'keyword', 100, 'Contexto comercial', true),
  ('commercial_context_blockers', 'qual economia', 'keyword', 100, 'Contexto comercial', true),
  ('commercial_context_blockers', 'sem fidelidade', 'keyword', 100, 'Negociação comercial', true),
  ('commercial_context_blockers', 'tirar a fidelidade', 'keyword', 100, 'Negociação comercial', true),
  ('commercial_context_blockers', 'como funciona o desconto', 'keyword', 100, 'Dúvida comercial', true),
  ('commercial_context_blockers', 'quando começo a economizar', 'keyword', 100, 'Dúvida comercial', true),
  ('commercial_context_blockers', 'vou mandar a fatura', 'keyword', 100, 'Envio documento', true),
  ('commercial_context_blockers', 'segue a fatura', 'keyword', 100, 'Envio documento', true),
  ('commercial_context_blockers', 'valor errado', 'keyword', 100, 'Correção proposta', true),
  ('commercial_context_blockers', 'nome errado', 'keyword', 100, 'Correção proposta', true),
  ('commercial_context_blockers', 'cpf errado', 'keyword', 100, 'Correção proposta', true),
  ('commercial_context_blockers', 'dados errados', 'keyword', 100, 'Correção proposta', true),
  ('commercial_context_blockers', 'status da proposta', 'keyword', 100, 'Status comercial', true),
  ('commercial_context_blockers', 'cadê a proposta', 'keyword', 100, 'Status comercial', true),
  ('commercial_context_blockers', 'cade a proposta', 'keyword', 100, 'Status comercial', true)
) AS t(category, pattern, pattern_type, priority, description, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM sofia_detection_patterns sdp 
  WHERE sdp.category = t.category AND sdp.pattern = t.pattern
);

-- 3. ADICIONAR patterns inequívocos de existing_client
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, description, is_active)
SELECT * FROM (VALUES
  ('existing_client', 'já sou cliente da coesa', 'keyword', 120, 'Confirmação direta', true),
  ('existing_client', 'ja sou cliente da coesa', 'keyword', 120, 'Confirmação direta', true),
  ('existing_client', 'já tenho contrato com vocês', 'keyword', 120, 'Confirmação direta', true),
  ('existing_client', 'assinei o contrato', 'keyword', 120, 'Confirmação direta', true),
  ('existing_client', 'não estou recebendo crédito', 'keyword', 110, 'Problema cliente', true),
  ('existing_client', 'nao estou recebendo credito', 'keyword', 110, 'Problema cliente', true),
  ('existing_client', 'cadê meus créditos', 'keyword', 110, 'Problema cliente', true),
  ('existing_client', 'desconto não veio', 'keyword', 110, 'Problema cliente', true),
  ('existing_client', 'não recebi o desconto', 'keyword', 110, 'Problema cliente', true),
  ('existing_client', 'quero cancelar', 'keyword', 120, 'Cancelamento', true),
  ('existing_client', 'cancelar o contrato', 'keyword', 120, 'Cancelamento', true)
) AS t(category, pattern, pattern_type, priority, description, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM sofia_detection_patterns sdp 
  WHERE sdp.category = t.category AND sdp.pattern = t.pattern
);

-- 4. ATUALIZAR PROMPT DE IA
INSERT INTO sofia_message_templates (category, template_key, template_text, priority, variables)
VALUES (
  'ai_prompts',
  'triagem_non_commercial_detection_v2',
  E'Analise a mensagem de um lead/cliente e determine se é COMERCIAL ou NÃO-COMERCIAL.

⚠️ REGRA CRÍTICA: Na DÚVIDA, classifique como COMERCIAL.

🟢 COMERCIAL (isNonCommercial = false):
- Perguntas sobre preços, descontos, planos, economia
- Pedidos de simulação ou proposta
- Envio de conta de luz para análise
- Negociação de fidelidade, prazo, condições
- Correções de dados em proposta
- Perguntas sobre como funciona o serviço
- Menção a distribuidora, consumo, valor de conta

🔴 NÃO-COMERCIAL (isNonCommercial = true):
- Cliente AFIRMA ser cliente COESA
- Problemas com créditos não recebido
- Pedidos de cancelamento
- Status de CONTRATO assinado

Mensagem: "${message}"

Responda APENAS com JSON:
{"isNonCommercial": true/false, "confidence": 0.0-1.0, "category": "...", "reasoning": "..."}',
  100,
  ARRAY['message']::text[]
)
ON CONFLICT (category, template_key) DO UPDATE SET 
  template_text = EXCLUDED.template_text,
  priority = EXCLUDED.priority;

-- 5. CRIAR REGRA NA RULE_MEMORY (usar guardrail que é válido)
INSERT INTO rule_memory (agent_id, rule_type, name, description, condition, action, priority, confidence, learned_from, learning_source, is_active)
VALUES (
  'sofia',
  'guardrail',
  'Priorizar contexto comercial sobre triagem',
  'ANTES de acionar triagem, verificar indicadores comerciais. Se houver QUALQUER indicador comercial, NÃO acionar triagem.',
  '{"trigger": "before_triage", "check_commercial_blockers": true}'::jsonb,
  '{"block_triage_if_commercial": true}'::jsonb,
  100,
  1.0,
  'manual',
  'manual',
  true
)
ON CONFLICT DO NOTHING;