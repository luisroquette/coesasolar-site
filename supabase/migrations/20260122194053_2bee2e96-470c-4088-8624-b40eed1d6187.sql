-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: RAG_TRIGGER_KEYWORDS to sofia_detection_patterns
-- Each keyword is a separate record with pattern_type = 'keyword'
-- ═══════════════════════════════════════════════════════════════

-- RAG TRIGGER: Objections
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, is_active, priority) VALUES
('rag_trigger_objections', 'golpe', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'fraude', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'piramide', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'pirâmide', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'desconfio', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'confiança', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'seguro', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'segurança', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'verdade', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'falso', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'mentira', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'enganar', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'roubo', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'reclamação', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'procon', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'advogado', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'judicial', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'processo', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'caro', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'barato', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'preço', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'valor', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'custo', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'não compensa', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'não vale', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'dúvida', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'medo', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'receio', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'problema', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'risco', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'perigoso', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'multa', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'cancelar', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'cancelamento', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'fidelidade', 'keyword', 'RAG trigger para objeções', true, 100),
('rag_trigger_objections', 'contrato', 'keyword', 'RAG trigger para objeções', true, 100);

-- RAG TRIGGER: Questions  
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, is_active, priority) VALUES
('rag_trigger_questions', 'como funciona', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'o que é', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'qual é', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'quanto', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'quando', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'onde', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'por que', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'porque', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'quem', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'como faço', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'me explica', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'pode explicar', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'entender', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'não entendi', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', 'pergunta', 'keyword', 'RAG trigger para perguntas', true, 100),
('rag_trigger_questions', '?', 'keyword', 'RAG trigger para perguntas', true, 100);

-- RAG TRIGGER: Product
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, is_active, priority) VALUES
('rag_trigger_product', 'energia solar', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'solar', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'fotovoltaic', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'assinatura', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'plano', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'desconto', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'economia', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'economizar', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'conta de luz', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'fatura', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'distribuidora', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'cemig', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'copel', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'cpfl', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'enel', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'light', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'coelba', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'energisa', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'equatorial', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'kwh', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'consumo', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'geração', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'usina', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'fazenda solar', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'crédito', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'compensação', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'bandeira', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'tarifa', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'tusd', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'aneel', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'geração distribuída', 'keyword', 'RAG trigger para produto', true, 100),
('rag_trigger_product', 'mercado livre', 'keyword', 'RAG trigger para produto', true, 100);

-- RAG TRIGGER: Company
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, is_active, priority) VALUES
('rag_trigger_company', 'coesa', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'inka', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'consórcio', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'cnpj', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'empresa', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'razão social', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'endereço', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'sede', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'telefone', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'contato', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'suporte', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'sac', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'atendimento', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'whatsapp', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'site', 'keyword', 'RAG trigger para empresa', true, 100),
('rag_trigger_company', 'portal', 'keyword', 'RAG trigger para empresa', true, 100);

-- RAG TRIGGER: Process
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, is_active, priority) VALUES
('rag_trigger_process', 'documento', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'documentos', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'identidade', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'rg', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'cpf', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'contrato social', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'comprovante', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'residência', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'cadastro', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'cadastrar', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'assinar', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'proposta', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'aceitar', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'etapa', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'próximo', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'passo', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'ativar', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'ativação', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'migração', 'keyword', 'RAG trigger para processo', true, 100),
('rag_trigger_process', 'instalação', 'keyword', 'RAG trigger para processo', true, 100);

-- RAG TRIGGER: Timing
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, is_active, priority) VALUES
('rag_trigger_timing', 'urgente', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'rápido', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'demora', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'prazo', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'tempo', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'dias', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'semanas', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'meses', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'quando começa', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'quando ativa', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'quanto tempo', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'imediato', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'agora', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'hoje', 'keyword', 'RAG trigger para timing', true, 100),
('rag_trigger_timing', 'amanhã', 'keyword', 'RAG trigger para timing', true, 100);

-- RAG SKIP: Trivial confirmations (regex patterns)
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, is_active, priority) VALUES
('rag_skip_trivial', '^(ok|sim|não|nao|ss|n|s|blz|beleza|certo|entendi|entendido|show|top|boa|bom|legal|ta|tá|tudo bem|tranquilo|perfeito|massa|dahora|valeu|vlw|obg|obrigad[oa]|brigad[oa]|obrigado|obrigada)$', 'regex', 'Mensagens triviais que devem pular RAG', true, 100);

-- RAG SKIP: Greetings (regex)
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, is_active, priority) VALUES
('rag_skip_greetings', '^(oi|olá|ola|hey|e aí|e ai|bom dia|boa tarde|boa noite|opa|eae|ei|hello|hi)!?$', 'regex', 'Saudações que devem pular RAG', true, 100);

-- RAG SKIP: Short confirmations (regex)
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, is_active, priority) VALUES
('rag_skip_confirmations', '^(pode ser|ta bom|tá bom|fechado|combinado|acordo|aceito|quero|vamos|bora|partiu|ok\\s*pode)$', 'regex', 'Confirmações curtas que devem pular RAG', true, 100);

-- RAG SKIP: Audio responses (regex)
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, is_active, priority) VALUES
('rag_skip_audio', '^(pode|pode sim|manda|manda sim|quero sim|pode mandar|pode audio|pode áudio)$', 'regex', 'Respostas de áudio que devem pular RAG', true, 100);

-- RAG SKIP: Short messages (regex)
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, is_active, priority) VALUES
('rag_skip_short', '^[a-záéíóúãõâêô]{1,10}(\\s+[a-záéíóúãõâêô]{1,10})?$', 'regex', 'Mensagens muito curtas (1-2 palavras)', true, 100);

-- MASTER OFFER: Acceptance keywords
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, is_active, priority) VALUES
('master_offer_accept', 'aceito', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'quero', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'quero sim', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'pode fechar', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'vamos fechar', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'fechado', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'bora', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'vamos', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'quero essa', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'quero garantir', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'quero os 30', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'aceito os 30', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'aceito a oferta', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'topo', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'topei', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'tô dentro', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'to dentro', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'sim quero', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'fechou', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'combinado', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'quero o desconto', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'quero 30%', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'aceito 30%', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'vamos nessa', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'vamos lá', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'pode mandar', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'manda o contrato', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'quero assinar', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'vou fechar', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'quero contrato', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'quero fechar', 'keyword', 'Aceitação de oferta MASTER', true, 100),
('master_offer_accept', 'aceito a proposta', 'keyword', 'Aceitação de oferta MASTER', true, 100);