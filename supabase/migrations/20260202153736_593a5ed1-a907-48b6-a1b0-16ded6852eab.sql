-- ================================================================
-- Phase 99: FSM Activation - Add Deterministic Templates + Tracking
-- ================================================================

-- 1. Add handler_type column for tracking which handler processed each message
ALTER TABLE chatbot_mensagens
ADD COLUMN IF NOT EXISTS handler_type VARCHAR(50);

-- 2. Create index for fast analytics queries on handler_type
CREATE INDEX IF NOT EXISTS idx_mensagens_handler_type 
ON chatbot_mensagens(handler_type, created_at)
WHERE handler_type IS NOT NULL;

-- 3. Add deterministic templates for CPF collection
INSERT INTO deterministic_response_templates 
(agent_id, current_state, expected_field, validation_result, response_template, next_state, next_expected_field, priority, is_active)
VALUES
-- CPF Success
('sofia', 'aguardando_cpf', 'cpf', 'success', 
 'Perfeito! CPF registrado: {cpf}. ✅ Agora preciso do seu endereço completo com CEP.', 
 'aguardando_endereco', 'endereco', 100, true),
-- CPF Invalid Format
('sofia', 'aguardando_cpf', 'cpf', 'invalid_format', 
 'O CPF precisa ter 11 dígitos. Pode verificar e me enviar novamente? 🔢', 
 NULL, 'cpf', 100, true),
-- CPF Missing
('sofia', 'aguardando_cpf', 'cpf', 'missing', 
 'Para prosseguir, preciso do seu CPF. Pode me enviar?', 
 NULL, 'cpf', 100, true),

-- CNPJ Success
('sofia', 'aguardando_cnpj', 'cnpj', 'success', 
 'CNPJ validado: {cnpj}. ✅ Agora preciso dos dados do representante legal.', 
 'aguardando_representante', NULL, 100, true),
-- CNPJ Invalid Format
('sofia', 'aguardando_cnpj', 'cnpj', 'invalid_format', 
 'O CNPJ precisa ter 14 dígitos. Pode verificar e me enviar novamente?', 
 NULL, 'cnpj', 100, true),

-- Telefone Success
('sofia', 'aguardando_telefone', 'telefone', 'success', 
 'Telefone anotado! 📱 Posso entrar em contato por esse número se precisar.', 
 NULL, NULL, 100, true),
-- Telefone Invalid Format
('sofia', 'aguardando_telefone', 'telefone', 'invalid_format', 
 'O número parece incompleto. Pode me enviar com DDD? (ex: 11 99999-8888)', 
 NULL, 'telefone', 100, true),

-- Endereco Success
('sofia', 'aguardando_endereco', 'endereco', 'success', 
 'Endereço registrado! ✅ Agora já tenho todos os dados para finalizar seu cadastro.', 
 'dados_completos', NULL, 100, true),
-- Endereco Missing
('sofia', 'aguardando_endereco', 'endereco', 'missing', 
 'Preciso do seu endereço completo com CEP para prosseguir. Pode me enviar?', 
 NULL, 'endereco', 100, true)

ON CONFLICT DO NOTHING;