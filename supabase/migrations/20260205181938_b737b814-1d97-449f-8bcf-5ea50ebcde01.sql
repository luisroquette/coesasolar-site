-- 1. Padrões para detectar excedente de consumo solar
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, is_active)
VALUES
  ('solar_excess_opportunity', 'não está gerando', 'keyword', 100, true),
  ('solar_excess_opportunity', 'nao esta gerando', 'keyword', 100, true),
  ('solar_excess_opportunity', 'não gera energia', 'keyword', 100, true),
  ('solar_excess_opportunity', 'nao gera energia', 'keyword', 100, true),
  ('solar_excess_opportunity', 'gera pouco', 'keyword', 100, true),
  ('solar_excess_opportunity', 'não cobre o consumo', 'keyword', 100, true),
  ('solar_excess_opportunity', 'nao cobre o consumo', 'keyword', 100, true),
  ('solar_excess_opportunity', 'ainda pago alto', 'keyword', 100, true),
  ('solar_excess_opportunity', 'conta ainda vem alta', 'keyword', 100, true),
  ('solar_excess_opportunity', 'consumo aumentou', 'keyword', 100, true),
  ('solar_excess_opportunity', 'sistema não dá conta', 'keyword', 100, true),
  ('solar_excess_opportunity', 'sistema nao da conta', 'keyword', 100, true),
  ('solar_excess_opportunity', 'placa não dá conta', 'keyword', 100, true),
  ('solar_excess_opportunity', 'placa nao da conta', 'keyword', 100, true),
  ('solar_excess_opportunity', 'painel não cobre', 'keyword', 100, true),
  ('solar_excess_opportunity', 'painel nao cobre', 'keyword', 100, true),
  ('solar_excess_opportunity', 'não cobre tudo', 'keyword', 100, true),
  ('solar_excess_opportunity', 'nao cobre tudo', 'keyword', 100, true),
  ('solar_excess_opportunity', 'gera menos do que', 'keyword', 100, true),
  ('solar_excess_opportunity', 'consumo maior que', 'keyword', 100, true);

-- 2. Regra na rule_memory para orientar LLM sobre excedente solar
INSERT INTO rule_memory (
  agent_id, name, description, condition, action, 
  priority, rule_type, is_active, learned_from
) VALUES (
  'sofia',
  'Atendimento Excedente Solar',
  'Cliente com geração própria (placas solares) mas que ainda paga conta de luz alta. A COESA PODE atender o excedente de consumo - a parte que as placas não cobrem.',
  '{"trigger": "client_has_solar_panels", "bill_value_gte": 250}',
  '{"instruction": "Explicar que a COESA atende o EXCEDENTE de consumo. O desconto se aplica à parte que as placas não cobrem. Exemplo: Se a conta é R$ 500 mesmo com placas, oferecemos até 25% de desconto nesse valor. NUNCA dizer que não atendemos quem tem placas.", "example_response": "Entendi! Mesmo com as placas, sua conta ainda vem alta porque o consumo é maior que a geração. A boa notícia é que a COESA funciona junto com suas placas! O desconto de até 25% se aplica no excedente - na parte que as placas não cobrem. Vamos calcular sua economia?"}',
  95,
  'hard_constraint',
  true,
  'explicit_config'
);

-- 3. Atualizar mensagem de desqualificação para ser condicional
UPDATE mensagens_desqualificacao 
SET mensagem_cliente = 'Se suas placas solares cobrem 100% do consumo e sua conta é apenas de taxas mínimas, infelizmente não temos como oferecer economia adicional. Mas se você ainda paga uma conta alta mesmo com as placas, podemos ajudar com o excedente! Quanto vem sua conta de luz?'
WHERE motivo = 'geracao_propria';