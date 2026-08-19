
-- ═══════════════════════════════════════════════════════════════
-- ONBOARDING PÓS-ASSINATURA: Padrões, Regras e Configurações
-- ═══════════════════════════════════════════════════════════════

-- 1. Padrões de detecção para onboarding
INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, is_active)
VALUES
  ('onboarding_energy_gap', 'quando recebo energia', 'keyword', 100, true),
  ('onboarding_energy_gap', 'quando começa a chegar', 'keyword', 100, true),
  ('onboarding_energy_gap', 'demora quanto tempo', 'keyword', 100, true),
  ('onboarding_energy_gap', 'quanto tempo demora', 'keyword', 100, true),
  ('onboarding_energy_gap', 'prazo para ativação', 'keyword', 100, true),
  ('onboarding_energy_gap', 'quando ativa', 'keyword', 100, true),
  ('onboarding_energy_gap', 'quando começa o desconto', 'keyword', 100, true),
  ('onboarding_energy_gap', 'quando começa a funcionar', 'keyword', 100, true),
  ('onboarding_first_boleto', 'quando vem o boleto', 'keyword', 100, true),
  ('onboarding_first_boleto', 'primeiro boleto', 'keyword', 100, true),
  ('onboarding_first_boleto', 'quando começo a pagar', 'keyword', 100, true),
  ('onboarding_first_boleto', 'quando pago o primeiro', 'keyword', 100, true),
  ('onboarding_first_boleto', 'quando chega o boleto', 'keyword', 100, true),
  ('onboarding_unify', 'unificar boleto', 'keyword', 100, true),
  ('onboarding_unify', 'um boleto só', 'keyword', 100, true),
  ('onboarding_unify', 'boleto único', 'keyword', 100, true),
  ('onboarding_unify', 'pagar só um boleto', 'keyword', 100, true),
  ('onboarding_unify', 'juntar boleto', 'keyword', 100, true),
  ('onboarding_unify', 'unificar fatura', 'keyword', 100, true),
  ('onboarding_unify', 'boleto unificado', 'keyword', 100, true),
  ('onboarding_portal', 'área do cliente', 'keyword', 100, true),
  ('onboarding_portal', 'portal do cliente', 'keyword', 100, true),
  ('onboarding_portal', 'primeiro acesso', 'keyword', 100, true),
  ('onboarding_portal', 'como acesso', 'keyword', 100, true),
  ('onboarding_portal', 'entrar no site', 'keyword', 100, true),
  ('onboarding_portal', 'criar senha', 'keyword', 100, true),
  ('onboarding_portal', 'esqueci senha', 'keyword', 100, true),
  ('onboarding_portal', 'login coesa', 'keyword', 100, true),
  ('onboarding_due_date', 'mudar vencimento', 'keyword', 100, true),
  ('onboarding_due_date', 'alterar vencimento', 'keyword', 100, true),
  ('onboarding_due_date', 'data do boleto', 'keyword', 100, true),
  ('onboarding_due_date', 'dia do vencimento', 'keyword', 100, true),
  ('onboarding_due_date', 'trocar o dia', 'keyword', 100, true),
  ('onboarding_due_date', 'vencimento do boleto', 'keyword', 100, true);

-- 2. Regras de comportamento para onboarding
INSERT INTO rule_memory (
  agent_id, name, description, condition, action, 
  priority, rule_type, is_active, learned_from
) VALUES 
('sofia', 'ONBOARDING_GAP_ENERGIA', 
'Cliente pergunta quando energia chega. Gap de até 2 meses é EXIGÊNCIA DA CONCESSIONÁRIA, não atraso da COESA.', 
'{"trigger": "onboarding_energy_gap"}',
'{"instruction": "O prazo de até 2 meses NÃO é atraso da COESA, é exigência da concessionária para processar a troca de geração. Pode ser mais rápido (próximo ciclo). Cliente verá conta abaixo da média quando energia chegar."}',
95, 'hard_constraint', true, 'explicit_config'),

('sofia', 'ONBOARDING_PRIMEIRO_BOLETO',
'Cliente pergunta sobre primeiro boleto. Vem 1 mês após primeira injeção de energia.',
'{"trigger": "onboarding_first_boleto"}',
'{"instruction": "Primeiro boleto COESA vem no mês seguinte à primeira injeção de energia. Ao pagar o primeiro boleto, o cliente se torna oficialmente cliente ativo COESA. Boletos enviados por email E WhatsApp."}',
95, 'hard_constraint', true, 'explicit_config'),

('sofia', 'ONBOARDING_UNIFICACAO',
'Cliente quer unificar boletos. Só a partir do 2º boleto, via portal do cliente.',
'{"trigger": "onboarding_unify"}',
'{"instruction": "Unificação disponível a partir do 2º boleto (NUNCA no primeiro). Acessar portal cliente.coesaenergia.com.br e ativar opção. Com unificação: pagando COESA, conta concessionária quitada automaticamente."}',
90, 'learned_pattern', true, 'explicit_config'),

('sofia', 'ONBOARDING_PORTAL_ACESSO',
'Cliente quer acessar portal. Primeiro acesso: email cadastrado + esqueci minha senha.',
'{"trigger": "onboarding_portal"}',
'{"instruction": "Acessar coesaenergia.com.br > canto superior direito > ÁREA DO CLIENTE. Primeiro acesso: usar email cadastrado e clicar em Esqueci minha senha para criar senha nova. Portal tem: dados pessoais, contratação, segunda via boletos, consumo e economia."}',
90, 'learned_pattern', true, 'explicit_config'),

('sofia', 'ONBOARDING_VENCIMENTO',
'Boleto COESA vence 5 dias antes da concessionária. Para alterar, mudar na CEMIG primeiro.',
'{"trigger": "onboarding_due_date"}',
'{"instruction": "Boleto COESA com unificação vence SEMPRE 5 dias antes do vencimento da CEMIG. Ex: CEMIG dia 10, COESA dia 5. Para alterar: cliente muda na CEMIG primeiro, COESA atualiza automaticamente."}',
90, 'learned_pattern', true, 'explicit_config');

-- 3. Configurações de texto
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES
('onboarding_welcome_message', 'Prezado(a) Assinante,

Seja bem-vindo(a) à Coesa Energia ⚡

Você começará a receber seu desconto na conta de energia!

📧 Seus boletos serão enviados por e-mail e WhatsApp.

⚠️ Importante: as taxas fixas da concessionária, como iluminação pública e tarifa de disponibilidade, permanecem e devem ser pagas normalmente — elas não recebem o desconto.

Caso prefira, podemos unificar os boletos para que você receba apenas um, diretamente da Coesa Energia. O que prefere?

Em caso de dúvidas, nosso suporte está à disposição:
📞 (31) 98440-0889

Atenciosamente,
Equipe Coesa Energia ⚡', 
'Mensagem de boas-vindas para novos clientes após assinatura do contrato'),

('onboarding_sac_phone', '31984400889', 
'Telefone de suporte para clientes em fase de onboarding'),

('onboarding_portal_url', 'https://cliente.coesaenergia.com.br/login',
'URL do portal do cliente COESA');
