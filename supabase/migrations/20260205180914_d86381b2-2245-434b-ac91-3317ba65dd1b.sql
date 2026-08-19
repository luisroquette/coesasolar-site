-- Inserir regra de resposta para recusa educada com alternativa (com rule_type válido)
INSERT INTO rule_memory (
  id,
  agent_id,
  rule_type,
  name,
  description,
  condition, 
  action,
  priority, 
  is_active,
  created_at
) VALUES (
  gen_random_uuid(),
  'sofia',
  'hard_constraint',
  'Recusa Educada com Alternativa',
  'Quando cliente com proposta ativa recusa educadamente por ter escolhido alternativa (concorrente, placas solares, financiamento próprio)',
  '{"recusa_definitiva": true, "has_proposta_id": true}'::jsonb,
  '{"instruction": "Responder com empatia genuína. Agradecer pelo tempo e consideração. Desejar sucesso com a escolha feita. Deixar porta aberta para o futuro sem insistência. NÃO fazer triagem. NÃO tentar virar a venda agressivamente.", "example_response": "Entendo, [nome]! 😊 Fico feliz que encontraram uma solução que funciona para vocês. Se no futuro quiserem conhecer a economia por assinatura da COESA, é só me chamar! Desejo sucesso com o projeto! 💚"}'::jsonb,
  90,
  true,
  now()
);