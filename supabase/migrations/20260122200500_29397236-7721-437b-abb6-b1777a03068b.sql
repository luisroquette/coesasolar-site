-- Migration: Add RAG_SECTION_KEYWORDS to sofia_detection_patterns table
-- These patterns are used to determine if RAG context already covers a topic
-- to avoid duplicating hardcoded prompt sections

-- Core institutional keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_institutional', 'cnpj', 'keyword', 'RAG section coverage: institutional', 50, true),
  ('rag_section_institutional', 'consórcio', 'keyword', 'RAG section coverage: institutional', 50, true),
  ('rag_section_institutional', 'inka', 'keyword', 'RAG section coverage: institutional', 50, true),
  ('rag_section_institutional', 'reclame aqui', 'keyword', 'RAG section coverage: institutional', 50, true),
  ('rag_section_institutional', '49.497.098', 'keyword', 'RAG section coverage: institutional CNPJ', 50, true),
  ('rag_section_institutional', '60.937.217', 'keyword', 'RAG section coverage: institutional CNPJ', 50, true),
  ('rag_section_institutional', 'razão social', 'keyword', 'RAG section coverage: institutional', 50, true),
  ('rag_section_institutional', 'endereço', 'keyword', 'RAG section coverage: institutional', 50, true),
  ('rag_section_institutional', 'sede', 'keyword', 'RAG section coverage: institutional', 50, true),
  ('rag_section_institutional', 'coesa energia', 'keyword', 'RAG section coverage: institutional', 50, true);

-- Plans keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_plans', 'plano', 'keyword', 'RAG section coverage: plans', 50, true),
  ('rag_section_plans', '15%', 'keyword', 'RAG section coverage: plans', 50, true),
  ('rag_section_plans', '20%', 'keyword', 'RAG section coverage: plans', 50, true),
  ('rag_section_plans', '25%', 'keyword', 'RAG section coverage: plans', 50, true),
  ('rag_section_plans', '30%', 'keyword', 'RAG section coverage: plans', 50, true),
  ('rag_section_plans', 'fidelidade', 'keyword', 'RAG section coverage: plans', 50, true),
  ('rag_section_plans', 'desconto', 'keyword', 'RAG section coverage: plans', 50, true),
  ('rag_section_plans', 'unlock', 'keyword', 'RAG section coverage: plans', 50, true),
  ('rag_section_plans', 'essencial', 'keyword', 'RAG section coverage: plans', 50, true),
  ('rag_section_plans', 'smart', 'keyword', 'RAG section coverage: plans', 50, true),
  ('rag_section_plans', 'master', 'keyword', 'RAG section coverage: plans', 50, true);

-- Objections keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_objections', 'objeção', 'keyword', 'RAG section coverage: objections', 50, true),
  ('rag_section_objections', 'objecao', 'keyword', 'RAG section coverage: objections', 50, true),
  ('rag_section_objections', 'golpe', 'keyword', 'RAG section coverage: objections', 50, true),
  ('rag_section_objections', 'fraude', 'keyword', 'RAG section coverage: objections', 50, true),
  ('rag_section_objections', 'confiança', 'keyword', 'RAG section coverage: objections', 50, true),
  ('rag_section_objections', 'caro', 'keyword', 'RAG section coverage: objections', 50, true),
  ('rag_section_objections', 'preço', 'keyword', 'RAG section coverage: objections', 50, true),
  ('rag_section_objections', 'desconfiança', 'keyword', 'RAG section coverage: objections', 50, true),
  ('rag_section_objections', 'medo', 'keyword', 'RAG section coverage: objections', 50, true),
  ('rag_section_objections', 'receio', 'keyword', 'RAG section coverage: objections', 50, true);

-- Billing education keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_billing', 'cip', 'keyword', 'RAG section coverage: billing', 50, true),
  ('rag_section_billing', 'cosip', 'keyword', 'RAG section coverage: billing', 50, true),
  ('rag_section_billing', 'iluminação pública', 'keyword', 'RAG section coverage: billing', 50, true),
  ('rag_section_billing', 'taxa de disponibilidade', 'keyword', 'RAG section coverage: billing', 50, true),
  ('rag_section_billing', 'bandeira', 'keyword', 'RAG section coverage: billing', 50, true),
  ('rag_section_billing', 'tarifária', 'keyword', 'RAG section coverage: billing', 50, true),
  ('rag_section_billing', 'taxa mínima', 'keyword', 'RAG section coverage: billing', 50, true),
  ('rag_section_billing', 'tusd', 'keyword', 'RAG section coverage: billing', 50, true);

-- Contract keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_contract', 'multa', 'keyword', 'RAG section coverage: contract', 50, true),
  ('rag_section_contract', 'rescisão', 'keyword', 'RAG section coverage: contract', 50, true),
  ('rag_section_contract', 'cancelamento', 'keyword', 'RAG section coverage: contract', 50, true),
  ('rag_section_contract', 'prazo', 'keyword', 'RAG section coverage: contract', 50, true),
  ('rag_section_contract', 'saldo remanescente', 'keyword', 'RAG section coverage: contract', 50, true),
  ('rag_section_contract', 'desligamento', 'keyword', 'RAG section coverage: contract', 50, true);

-- Credibility keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_credibility', 'clientes', 'keyword', 'RAG section coverage: credibility', 50, true),
  ('rag_section_credibility', 'atendidos', 'keyword', 'RAG section coverage: credibility', 50, true),
  ('rag_section_credibility', 'boticário', 'keyword', 'RAG section coverage: credibility', 50, true),
  ('rag_section_credibility', 'petrobras', 'keyword', 'RAG section coverage: credibility', 50, true),
  ('rag_section_credibility', 'ipiranga', 'keyword', 'RAG section coverage: credibility', 50, true),
  ('rag_section_credibility', 'ortobom', 'keyword', 'RAG section coverage: credibility', 50, true),
  ('rag_section_credibility', 'referência', 'keyword', 'RAG section coverage: credibility', 50, true),
  ('rag_section_credibility', 'parceiros', 'keyword', 'RAG section coverage: credibility', 50, true);

-- Process keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_process', 'proposta inicial', 'keyword', 'RAG section coverage: process', 50, true),
  ('rag_section_process', 'proposta definitiva', 'keyword', 'RAG section coverage: process', 50, true),
  ('rag_section_process', 'documentos', 'keyword', 'RAG section coverage: process', 50, true),
  ('rag_section_process', 'contrato', 'keyword', 'RAG section coverage: process', 50, true),
  ('rag_section_process', 'assinatura', 'keyword', 'RAG section coverage: process', 50, true),
  ('rag_section_process', 'etapa', 'keyword', 'RAG section coverage: process', 50, true);

-- Distributors keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_distributors', 'cemig', 'keyword', 'RAG section coverage: distributors', 50, true),
  ('rag_section_distributors', 'coelba', 'keyword', 'RAG section coverage: distributors', 50, true),
  ('rag_section_distributors', 'cpfl paulista', 'keyword', 'RAG section coverage: distributors', 50, true),
  ('rag_section_distributors', 'distribuidora', 'keyword', 'RAG section coverage: distributors', 50, true),
  ('rag_section_distributors', 'atendemos', 'keyword', 'RAG section coverage: distributors', 50, true),
  ('rag_section_distributors', 'neoenergia', 'keyword', 'RAG section coverage: distributors', 50, true),
  ('rag_section_distributors', 'área de atuação', 'keyword', 'RAG section coverage: distributors', 50, true);

-- Sales script keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_sales_script', 'achievement', 'keyword', 'RAG section coverage: sales_script', 50, true),
  ('rag_section_sales_script', 'funil', 'keyword', 'RAG section coverage: sales_script', 50, true),
  ('rag_section_sales_script', 'estágio', 'keyword', 'RAG section coverage: sales_script', 50, true),
  ('rag_section_sales_script', 'coleta', 'keyword', 'RAG section coverage: sales_script', 50, true),
  ('rag_section_sales_script', 'fechamento', 'keyword', 'RAG section coverage: sales_script', 50, true),
  ('rag_section_sales_script', 'follow up', 'keyword', 'RAG section coverage: sales_script', 50, true),
  ('rag_section_sales_script', 'workflow', 'keyword', 'RAG section coverage: sales_script', 50, true),
  ('rag_section_sales_script', 'qualificação', 'keyword', 'RAG section coverage: sales_script', 50, true),
  ('rag_section_sales_script', 'roteiro', 'keyword', 'RAG section coverage: sales_script', 50, true);

-- Sofia limitations keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_sofia_limitations', 'limitações', 'keyword', 'RAG section coverage: sofia_limitations', 50, true),
  ('rag_section_sofia_limitations', 'não pode', 'keyword', 'RAG section coverage: sofia_limitations', 50, true),
  ('rag_section_sofia_limitations', 'sistema faz', 'keyword', 'RAG section coverage: sofia_limitations', 50, true),
  ('rag_section_sofia_limitations', 'checklist', 'keyword', 'RAG section coverage: sofia_limitations', 50, true),
  ('rag_section_sofia_limitations', 'anti-alucinação', 'keyword', 'RAG section coverage: sofia_limitations', 50, true),
  ('rag_section_sofia_limitations', 'proibições', 'keyword', 'RAG section coverage: sofia_limitations', 50, true);

-- Welcome rules keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_welcome_rules', 'acolhimento', 'keyword', 'RAG section coverage: welcome_rules', 50, true),
  ('rag_section_welcome_rules', 'cumprimento', 'keyword', 'RAG section coverage: welcome_rules', 50, true),
  ('rag_section_welcome_rules', 'bom dia', 'keyword', 'RAG section coverage: welcome_rules', 50, true),
  ('rag_section_welcome_rules', 'boa tarde', 'keyword', 'RAG section coverage: welcome_rules', 50, true),
  ('rag_section_welcome_rules', 'perguntar nome', 'keyword', 'RAG section coverage: welcome_rules', 50, true),
  ('rag_section_welcome_rules', 'leads novos', 'keyword', 'RAG section coverage: welcome_rules', 50, true),
  ('rag_section_welcome_rules', 'primeira mensagem', 'keyword', 'RAG section coverage: welcome_rules', 50, true);

-- Educational pause keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_educational_pause', 'pausa educativa', 'keyword', 'RAG section coverage: educational_pause', 50, true),
  ('rag_section_educational_pause', 'como funciona', 'keyword', 'RAG section coverage: educational_pause', 50, true),
  ('rag_section_educational_pause', 'energia por assinatura', 'keyword', 'RAG section coverage: educational_pause', 50, true),
  ('rag_section_educational_pause', 'créditos', 'keyword', 'RAG section coverage: educational_pause', 50, true),
  ('rag_section_educational_pause', 'fazenda solar', 'keyword', 'RAG section coverage: educational_pause', 50, true);

-- Proposal requirements keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_proposal_requirements', 'requisitos', 'keyword', 'RAG section coverage: proposal_requirements', 50, true),
  ('rag_section_proposal_requirements', 'dados obrigatórios', 'keyword', 'RAG section coverage: proposal_requirements', 50, true),
  ('rag_section_proposal_requirements', 'nome obrigatório', 'keyword', 'RAG section coverage: proposal_requirements', 50, true),
  ('rag_section_proposal_requirements', 'email obrigatório', 'keyword', 'RAG section coverage: proposal_requirements', 50, true),
  ('rag_section_proposal_requirements', 'valor da conta', 'keyword', 'RAG section coverage: proposal_requirements', 50, true),
  ('rag_section_proposal_requirements', 'documentos necessários', 'keyword', 'RAG section coverage: proposal_requirements', 50, true);

-- Communication rules keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_communication_rules', 'brevidade', 'keyword', 'RAG section coverage: communication_rules', 50, true),
  ('rag_section_communication_rules', 'máximo linhas', 'keyword', 'RAG section coverage: communication_rules', 50, true),
  ('rag_section_communication_rules', 'regras de áudio', 'keyword', 'RAG section coverage: communication_rules', 50, true),
  ('rag_section_communication_rules', 'tom de voz', 'keyword', 'RAG section coverage: communication_rules', 50, true),
  ('rag_section_communication_rules', 'emojis permitidos', 'keyword', 'RAG section coverage: communication_rules', 50, true),
  ('rag_section_communication_rules', 'tratamento', 'keyword', 'RAG section coverage: communication_rules', 50, true);

-- Urgency 30min keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_urgency_30min', '30 minutos', 'keyword', 'RAG section coverage: urgency_30min', 50, true),
  ('rag_section_urgency_30min', 'micro-compromisso', 'keyword', 'RAG section coverage: urgency_30min', 50, true),
  ('rag_section_urgency_30min', 'urgência', 'keyword', 'RAG section coverage: urgency_30min', 50, true),
  ('rag_section_urgency_30min', 'janela', 'keyword', 'RAG section coverage: urgency_30min', 50, true),
  ('rag_section_urgency_30min', 'pressão positiva', 'keyword', 'RAG section coverage: urgency_30min', 50, true);

-- Master offer keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_master_offer', 'oferta master', 'keyword', 'RAG section coverage: master_offer', 50, true),
  ('rag_section_master_offer', 'última cartada', 'keyword', 'RAG section coverage: master_offer', 50, true),
  ('rag_section_master_offer', '12 horas', 'keyword', 'RAG section coverage: master_offer', 50, true),
  ('rag_section_master_offer', 'janela especial', 'keyword', 'RAG section coverage: master_offer', 50, true),
  ('rag_section_master_offer', 'condição máxima', 'keyword', 'RAG section coverage: master_offer', 50, true);

-- Escalation rules keywords
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('rag_section_escalation_rules', 'escalação', 'keyword', 'RAG section coverage: escalation_rules', 50, true),
  ('rag_section_escalation_rules', 'escalar', 'keyword', 'RAG section coverage: escalation_rules', 50, true),
  ('rag_section_escalation_rules', 'supervisor', 'keyword', 'RAG section coverage: escalation_rules', 50, true),
  ('rag_section_escalation_rules', 'humano', 'keyword', 'RAG section coverage: escalation_rules', 50, true),
  ('rag_section_escalation_rules', 'atendente', 'keyword', 'RAG section coverage: escalation_rules', 50, true),
  ('rag_section_escalation_rules', 'não sei responder', 'keyword', 'RAG section coverage: escalation_rules', 50, true);