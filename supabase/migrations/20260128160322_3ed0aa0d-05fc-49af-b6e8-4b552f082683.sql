-- ================================================================
-- RAG Critical Intent Triggers - Phase 46
-- Add patterns for documents, proposals, pricing, and objections
-- ================================================================

-- 1. New category: rag_trigger_documents (critical - documents collection)
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, response_template, is_active)
VALUES
  ('rag_trigger_documents', 'documento', 'keyword', 90, NULL, true),
  ('rag_trigger_documents', 'fatura', 'keyword', 90, NULL, true),
  ('rag_trigger_documents', 'conta de luz', 'keyword', 90, NULL, true),
  ('rag_trigger_documents', 'conta de energia', 'keyword', 90, NULL, true),
  ('rag_trigger_documents', 'cpf', 'keyword', 90, NULL, true),
  ('rag_trigger_documents', 'cnpj', 'keyword', 90, NULL, true),
  ('rag_trigger_documents', 'rg', 'keyword', 90, NULL, true),
  ('rag_trigger_documents', 'comprovante', 'keyword', 90, NULL, true),
  ('rag_trigger_documents', 'foto', 'keyword', 85, NULL, true),
  ('rag_trigger_documents', 'enviar', 'keyword', 80, NULL, true),
  ('rag_trigger_documents', 'mandar', 'keyword', 80, NULL, true),
  ('rag_trigger_documents', 'anexo', 'keyword', 85, NULL, true),
  ('rag_trigger_documents', 'selfie', 'keyword', 85, NULL, true),
  ('rag_trigger_documents', 'contrato social', 'keyword', 90, NULL, true)
ON CONFLICT DO NOTHING;

-- 2. New category: rag_trigger_proposal (critical - proposal/pricing stage)
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, response_template, is_active)
VALUES
  ('rag_trigger_proposal', 'proposta', 'keyword', 95, NULL, true),
  ('rag_trigger_proposal', 'simulação', 'keyword', 90, NULL, true),
  ('rag_trigger_proposal', 'simular', 'keyword', 90, NULL, true),
  ('rag_trigger_proposal', 'economia', 'keyword', 85, NULL, true),
  ('rag_trigger_proposal', 'desconto', 'keyword', 90, NULL, true),
  ('rag_trigger_proposal', 'quanto vou economizar', 'keyword', 95, NULL, true),
  ('rag_trigger_proposal', 'quanto pago', 'keyword', 90, NULL, true),
  ('rag_trigger_proposal', 'valor', 'keyword', 80, NULL, true),
  ('rag_trigger_proposal', 'plano', 'keyword', 85, NULL, true),
  ('rag_trigger_proposal', 'aceito', 'keyword', 90, NULL, true),
  ('rag_trigger_proposal', 'fechar', 'keyword', 90, NULL, true),
  ('rag_trigger_proposal', 'assinar', 'keyword', 90, NULL, true),
  ('rag_trigger_proposal', 'contrato', 'keyword', 90, NULL, true)
ON CONFLICT DO NOTHING;

-- 3. New category: rag_trigger_pricing (critical - pricing questions)
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, response_template, is_active)
VALUES
  ('rag_trigger_pricing', 'caro', 'keyword', 90, NULL, true),
  ('rag_trigger_pricing', 'barato', 'keyword', 85, NULL, true),
  ('rag_trigger_pricing', 'preço', 'keyword', 90, NULL, true),
  ('rag_trigger_pricing', 'custo', 'keyword', 85, NULL, true),
  ('rag_trigger_pricing', 'mensalidade', 'keyword', 90, NULL, true),
  ('rag_trigger_pricing', 'taxa', 'keyword', 85, NULL, true),
  ('rag_trigger_pricing', 'tarifa', 'keyword', 85, NULL, true),
  ('rag_trigger_pricing', 'reais', 'keyword', 75, NULL, true),
  ('rag_trigger_pricing', 'por cento', 'keyword', 85, NULL, true),
  ('rag_trigger_pricing', '%', 'keyword', 80, NULL, true),
  ('rag_trigger_pricing', 'kwh', 'keyword', 85, NULL, true),
  ('rag_trigger_pricing', 'energia injetada', 'keyword', 90, NULL, true)
ON CONFLICT DO NOTHING;

-- 4. Enhance existing rag_trigger_objections with more patterns
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, response_template, is_active)
VALUES
  ('rag_trigger_objections', 'golpe', 'keyword', 95, NULL, true),
  ('rag_trigger_objections', 'fraude', 'keyword', 95, NULL, true),
  ('rag_trigger_objections', 'não confio', 'keyword', 95, NULL, true),
  ('rag_trigger_objections', 'nao confio', 'keyword', 95, NULL, true),
  ('rag_trigger_objections', 'desconfio', 'keyword', 90, NULL, true),
  ('rag_trigger_objections', 'é seguro', 'keyword', 90, NULL, true),
  ('rag_trigger_objections', 'confiável', 'keyword', 90, NULL, true),
  ('rag_trigger_objections', 'funciona mesmo', 'keyword', 90, NULL, true),
  ('rag_trigger_objections', 'furada', 'keyword', 95, NULL, true),
  ('rag_trigger_objections', 'pirâmide', 'keyword', 95, NULL, true),
  ('rag_trigger_objections', 'reclame aqui', 'keyword', 90, NULL, true),
  ('rag_trigger_objections', 'desvantagem', 'keyword', 85, NULL, true),
  ('rag_trigger_objections', 'não quero', 'keyword', 85, NULL, true),
  ('rag_trigger_objections', 'desistir', 'keyword', 90, NULL, true),
  ('rag_trigger_objections', 'cancelar', 'keyword', 90, NULL, true),
  ('rag_trigger_objections', 'depois', 'keyword', 75, NULL, true),
  ('rag_trigger_objections', 'pensar', 'keyword', 80, NULL, true),
  ('rag_trigger_objections', 'fidelidade', 'keyword', 90, NULL, true),
  ('rag_trigger_objections', 'multa', 'keyword', 90, NULL, true)
ON CONFLICT DO NOTHING;

-- 5. New category: rag_trigger_critical_questions (high-value questions)
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, response_template, is_active)
VALUES
  ('rag_trigger_critical', 'como funciona', 'keyword', 90, NULL, true),
  ('rag_trigger_critical', 'o que é', 'keyword', 85, NULL, true),
  ('rag_trigger_critical', 'explica', 'keyword', 85, NULL, true),
  ('rag_trigger_critical', 'entendi não', 'keyword', 90, NULL, true),
  ('rag_trigger_critical', 'não entendi', 'keyword', 90, NULL, true),
  ('rag_trigger_critical', 'pode explicar', 'keyword', 90, NULL, true),
  ('rag_trigger_critical', 'dúvida', 'keyword', 85, NULL, true),
  ('rag_trigger_critical', 'porque', 'keyword', 80, NULL, true),
  ('rag_trigger_critical', 'por que', 'keyword', 80, NULL, true),
  ('rag_trigger_critical', 'qual a diferença', 'keyword', 90, NULL, true),
  ('rag_trigger_critical', 'vantagem', 'keyword', 85, NULL, true),
  ('rag_trigger_critical', 'benefício', 'keyword', 85, NULL, true)
ON CONFLICT DO NOTHING;

-- 6. Update skip categories to be less aggressive (lower priority)
UPDATE sofia_detection_patterns 
SET priority = 40 
WHERE category IN ('rag_skip_trivial', 'rag_skip_greetings', 'rag_skip_confirmations')
  AND priority > 40;

-- 7. Add config flag for critical intent boost
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES ('rag_critical_intent_boost', 'true', 'Aumenta prioridade do RAG para intenções críticas (docs, proposta, preço, objeções)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;