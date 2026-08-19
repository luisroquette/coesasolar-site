-- Step 1: Add response_template column to sofia_detection_patterns
ALTER TABLE public.sofia_detection_patterns 
ADD COLUMN IF NOT EXISTS response_template TEXT;

-- Step 2: Insert OBJECTION patterns with responses
-- PRECO objection patterns
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active, response_template)
VALUES 
  ('objection_preco', 'caro', 'keyword', 'Preocupação com preço - palavra caro', 80, true, 'Entendi, é sobre preço. Aqui você não paga mais — você paga menos todo mês. Quer ajustar o desconto ou o prazo?'),
  ('objection_preco', 'valor alto', 'keyword', 'Preocupação com preço - valor alto', 80, true, NULL),
  ('objection_preco', 'não compensa', 'keyword', 'Preocupação com preço - não compensa', 80, true, NULL),
  ('objection_preco', 'pagar mais', 'keyword', 'Preocupação com preço - pagar mais', 80, true, NULL),
  ('objection_preco', 'economia pequena', 'keyword', 'Preocupação com economia', 80, true, NULL),
  ('objection_preco', 'pouco desconto', 'keyword', 'Preocupação com desconto', 80, true, NULL)
ON CONFLICT DO NOTHING;

-- CONFIANCA objection patterns
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active, response_template)
VALUES 
  ('objection_confianca', 'golpe', 'keyword', 'Desconfiança - golpe', 90, true, 'Justo desconfiar. COESA opera desde 2018, +2000 clientes. Quer ver como funciona na fatura ou no contrato?'),
  ('objection_confianca', 'desconfio', 'keyword', 'Desconfiança explícita', 90, true, NULL),
  ('objection_confianca', 'confiar', 'keyword', 'Questão de confiança', 90, true, NULL),
  ('objection_confianca', 'piramide', 'keyword', 'Suspeita de pirâmide', 90, true, NULL),
  ('objection_confianca', 'fraude', 'keyword', 'Suspeita de fraude', 90, true, NULL),
  ('objection_confianca', 'enganar', 'keyword', 'Medo de ser enganado', 90, true, NULL)
ON CONFLICT DO NOTHING;

-- CONTRATO objection patterns
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active, response_template)
VALUES 
  ('objection_contrato', 'multa', 'keyword', 'Preocupação com multa', 85, true, 'Existe contrato, sim. É isso que garante sua economia. Quer ver exatamente onde está a multa antes de assinar?'),
  ('objection_contrato', 'fidelidade', 'keyword', 'Preocupação com fidelidade', 85, true, NULL),
  ('objection_contrato', 'preso', 'keyword', 'Medo de ficar preso', 85, true, NULL),
  ('objection_contrato', 'cancelar', 'keyword', 'Preocupação com cancelamento', 85, true, NULL),
  ('objection_contrato', 'rescisão', 'keyword', 'Preocupação com rescisão', 85, true, NULL),
  ('objection_contrato', 'amarrado', 'keyword', 'Medo de ficar amarrado', 85, true, NULL),
  ('objection_contrato', 'preso ao contrato', 'keyword', 'Medo de contrato', 85, true, NULL)
ON CONFLICT DO NOTHING;

-- TEMPO objection patterns
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active, response_template)
VALUES 
  ('objection_tempo', 'vou pensar', 'keyword', 'Precisa de tempo para pensar', 75, true, 'Claro. Antes disso, me diga: o que precisa estar claro pra decidir hoje?'),
  ('objection_tempo', 'depois vejo', 'keyword', 'Quer deixar para depois', 75, true, NULL),
  ('objection_tempo', 'outro dia', 'keyword', 'Quer outro dia', 75, true, NULL),
  ('objection_tempo', 'semana que vem', 'keyword', 'Quer semana que vem', 75, true, NULL),
  ('objection_tempo', 'mais tarde', 'keyword', 'Quer mais tarde', 75, true, NULL),
  ('objection_tempo', 'agora não', 'keyword', 'Não pode agora', 75, true, NULL),
  ('objection_tempo', 'tenho pressa', 'keyword', 'Tem pressa', 75, true, NULL)
ON CONFLICT DO NOTHING;

-- COMPLEXIDADE objection patterns
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active, response_template)
VALUES 
  ('objection_complexidade', 'complicado', 'keyword', 'Acha complicado', 70, true, 'Simplificando: você continua recebendo energia da mesma distribuidora, mas com desconto. Posso explicar um ponto específico?'),
  ('objection_complexidade', 'não entendi', 'keyword', 'Não entendeu', 70, true, NULL),
  ('objection_complexidade', 'confuso', 'keyword', 'Está confuso', 70, true, NULL),
  ('objection_complexidade', 'difícil', 'keyword', 'Acha difícil', 70, true, NULL),
  ('objection_complexidade', 'complexo', 'keyword', 'Acha complexo', 70, true, NULL),
  ('objection_complexidade', 'como assim', 'keyword', 'Precisa de explicação', 70, true, NULL),
  ('objection_complexidade', 'não sei como', 'keyword', 'Não sabe como funciona', 70, true, NULL)
ON CONFLICT DO NOTHING;

-- AUTORIDADE objection patterns
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active, response_template)
VALUES 
  ('objection_autoridade', 'esposa', 'keyword', 'Precisa consultar esposa', 65, true, 'Faz sentido. Quer que eu monte uma simulação pra vocês analisarem juntos?'),
  ('objection_autoridade', 'marido', 'keyword', 'Precisa consultar marido', 65, true, NULL),
  ('objection_autoridade', 'sócio', 'keyword', 'Precisa consultar sócio', 65, true, NULL),
  ('objection_autoridade', 'consultar', 'keyword', 'Precisa consultar alguém', 65, true, NULL),
  ('objection_autoridade', 'decidir junto', 'keyword', 'Decisão conjunta', 65, true, NULL),
  ('objection_autoridade', 'meu parceiro', 'keyword', 'Precisa consultar parceiro', 65, true, NULL),
  ('objection_autoridade', 'família', 'keyword', 'Precisa consultar família', 65, true, NULL),
  ('objection_autoridade', 'contador', 'keyword', 'Precisa consultar contador', 65, true, NULL)
ON CONFLICT DO NOTHING;

-- SCORE_KEYWORDS patterns (for lead scoring)
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('score_valor_conta', 'valor', 'keyword', 'Menciona valor da conta', 50, true),
  ('score_valor_conta', 'conta', 'keyword', 'Menciona conta', 50, true),
  ('score_valor_conta', 'pago', 'keyword', 'Menciona quanto paga', 50, true),
  ('score_valor_conta', 'gasto', 'keyword', 'Menciona gasto', 50, true),
  ('score_valor_conta', 'r$', 'keyword', 'Menciona valor em reais', 50, true),
  ('score_valor_conta', 'reais', 'keyword', 'Menciona reais', 50, true),
  ('score_valor_conta', 'média', 'keyword', 'Menciona média', 50, true),
  ('score_valor_conta', 'mensal', 'keyword', 'Menciona mensal', 50, true),
  ('score_contrato', 'contrato', 'keyword', 'Menciona contrato', 60, true),
  ('score_contrato', 'termo', 'keyword', 'Menciona termo', 60, true),
  ('score_contrato', 'assinar', 'keyword', 'Menciona assinar', 60, true),
  ('score_contrato', 'assinatura', 'keyword', 'Menciona assinatura', 60, true),
  ('score_contrato', 'documento', 'keyword', 'Menciona documento', 60, true),
  ('score_multa', 'multa', 'keyword', 'Pergunta sobre multa', 55, true),
  ('score_multa', 'cancelamento', 'keyword', 'Pergunta sobre cancelamento', 55, true),
  ('score_multa', 'rescisão', 'keyword', 'Pergunta sobre rescisão', 55, true),
  ('score_proposta', 'proposta', 'keyword', 'Menciona proposta', 70, true),
  ('score_proposta', 'simulação', 'keyword', 'Menciona simulação', 70, true),
  ('score_proposta', 'simular', 'keyword', 'Quer simular', 70, true),
  ('score_proposta', 'calcular', 'keyword', 'Quer calcular', 70, true),
  ('score_proposta', 'orçamento', 'keyword', 'Quer orçamento', 70, true)
ON CONFLICT DO NOTHING;

-- FUNNEL_KEYWORDS patterns
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active)
VALUES 
  ('funnel_simulation', 'simular', 'keyword', 'Quer simular', 60, true),
  ('funnel_simulation', 'simulação', 'keyword', 'Menciona simulação', 60, true),
  ('funnel_simulation', 'calcular', 'keyword', 'Quer calcular', 60, true),
  ('funnel_simulation', 'orçamento', 'keyword', 'Quer orçamento', 60, true),
  ('funnel_simulation', 'quanto economizo', 'keyword', 'Quer saber economia', 60, true),
  ('funnel_conversion', 'assinar', 'keyword', 'Quer assinar', 90, true),
  ('funnel_conversion', 'fechar', 'keyword', 'Quer fechar', 90, true),
  ('funnel_conversion', 'contratar', 'keyword', 'Quer contratar', 90, true),
  ('funnel_conversion', 'quero', 'keyword', 'Expressa desejo', 85, true),
  ('funnel_conversion', 'vou fazer', 'keyword', 'Vai fazer', 90, true),
  ('funnel_conversion', 'vamos lá', 'keyword', 'Confirma ação', 90, true)
ON CONFLICT DO NOTHING;

-- AB_CLOSING_PHRASES patterns
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active, response_template)
VALUES 
  ('ab_closing_a', 'variant_a', 'keyword', 'Variante A do teste A/B', 50, true, 'Prefere 20% com mais flexibilidade ou 25% com máxima economia?'),
  ('ab_closing_b', 'variant_b', 'keyword', 'Variante B do teste A/B', 50, true, 'Cada dia que passa é dinheiro perdido. Quer 20% ou 25%?')
ON CONFLICT DO NOTHING;