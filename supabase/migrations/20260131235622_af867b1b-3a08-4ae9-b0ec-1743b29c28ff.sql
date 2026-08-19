-- ============================================
-- DETERMINISTIC ROUTER LAYER - DATABASE SETUP
-- ============================================

-- 1. Tabela de templates de resposta determinística
CREATE TABLE public.deterministic_response_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  current_state TEXT NOT NULL,
  expected_field TEXT NOT NULL,
  validation_result TEXT NOT NULL CHECK (validation_result IN ('success', 'fail', 'invalid_format', 'missing')),
  response_template TEXT NOT NULL,
  next_state TEXT,
  next_expected_field TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para busca rápida
CREATE INDEX idx_det_templates_lookup ON public.deterministic_response_templates 
  (agent_id, current_state, expected_field, validation_result) 
  WHERE is_active = true;

-- 2. Adicionar campos FSM em chatbot_conversas
ALTER TABLE public.chatbot_conversas 
  ADD COLUMN IF NOT EXISTS fsm_expected_field TEXT,
  ADD COLUMN IF NOT EXISTS field_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_deterministic_response_at TIMESTAMP WITH TIME ZONE;

-- 3. Enable RLS
ALTER TABLE public.deterministic_response_templates ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública (edge functions precisam ler)
CREATE POLICY "Allow read access to deterministic templates"
  ON public.deterministic_response_templates
  FOR SELECT
  USING (true);

-- Política de escrita apenas para admins autenticados
CREATE POLICY "Allow admin write access to deterministic templates"
  ON public.deterministic_response_templates
  FOR ALL
  USING (
    auth.uid() IS NOT NULL AND 
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND 
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- 4. Trigger para updated_at
CREATE TRIGGER update_deterministic_templates_updated_at
  BEFORE UPDATE ON public.deterministic_response_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Popular com templates iniciais para Sofia
INSERT INTO public.deterministic_response_templates 
  (agent_id, current_state, expected_field, validation_result, response_template, next_state, next_expected_field, priority)
VALUES
  -- Coleta de NOME
  ('sofia', 'aguardando_nome', 'nome', 'success', 
   'Prazer em te conhecer, {first_name}! 😊 Para eu te enviar a proposta personalizada, qual o seu melhor e-mail?', 
   'aguardando_email', 'email', 100),
  ('sofia', 'aguardando_nome', 'nome', 'fail', 
   'Por favor, me diz seu nome completo para eu poder te atender melhor! 😊', 
   'aguardando_nome', 'nome', 100),
  ('sofia', 'aguardando_nome', 'nome', 'missing', 
   'Antes de continuar, preciso saber seu nome! Como posso te chamar?', 
   'aguardando_nome', 'nome', 100),

  -- Coleta de EMAIL
  ('sofia', 'aguardando_email', 'email', 'success', 
   'Perfeito! ✅ Anotei seu e-mail. Agora me conta: qual o valor médio da sua conta de luz?', 
   'aguardando_valor', 'valor', 100),
  ('sofia', 'aguardando_email', 'email', 'fail', 
   'Hmm, parece que o e-mail não está no formato certo... Pode me enviar novamente? (exemplo: seunome@email.com)', 
   'aguardando_email', 'email', 100),
  ('sofia', 'aguardando_email', 'email', 'invalid_format', 
   'Ops! 🤔 Esse e-mail parece estar incompleto. Pode digitar novamente?', 
   'aguardando_email', 'email', 100),
  ('sofia', 'aguardando_email', 'email', 'missing', 
   'Para te enviar a proposta, preciso do seu e-mail! Qual é?', 
   'aguardando_email', 'email', 100),

  -- Coleta de VALOR
  ('sofia', 'aguardando_valor', 'valor', 'success', 
   'Ótimo! Com R$ {valor_extraido} de conta, você pode economizar bastante! 💰 Qual é a sua distribuidora de energia?', 
   'aguardando_distribuidora', 'distribuidora', 100),
  ('sofia', 'aguardando_valor', 'valor', 'fail', 
   'Não consegui identificar o valor... Pode me dizer quanto você paga aproximadamente na conta de luz? (exemplo: 450 reais)', 
   'aguardando_valor', 'valor', 100),
  ('sofia', 'aguardando_valor', 'valor', 'missing', 
   'Para calcular sua economia, preciso saber o valor médio da sua conta de luz. Quanto você paga por mês?', 
   'aguardando_valor', 'valor', 100),

  -- Coleta de DISTRIBUIDORA
  ('sofia', 'aguardando_distribuidora', 'distribuidora', 'success', 
   'Show! {distribuidora} atendida! ✅ Vou preparar sua proposta personalizada. Um momento...', 
   'gerando_proposta', NULL, 100),
  ('sofia', 'aguardando_distribuidora', 'distribuidora', 'fail', 
   'Não identifiquei a distribuidora... Qual o nome que aparece na sua conta de luz? (ex: CEMIG, CPFL, ENEL, LIGHT)', 
   'aguardando_distribuidora', 'distribuidora', 100),
  ('sofia', 'aguardando_distribuidora', 'distribuidora', 'missing', 
   'Qual é a distribuidora de energia da sua região? (o nome que aparece na conta)', 
   'aguardando_distribuidora', 'distribuidora', 100),

  -- Confirmação de proposta
  ('sofia', 'proposta_enviada', 'confirmacao', 'success', 
   'Que ótimo que você gostou! 🎉 Para dar continuidade, você pode enviar seus documentos diretamente na página da proposta. Quer que eu te explique como funciona?', 
   'aguardando_docs', NULL, 100),
  ('sofia', 'proposta_enviada', 'confirmacao', 'fail', 
   'Entendi! Se tiver alguma dúvida sobre a proposta, pode me perguntar que eu te ajudo a entender melhor.', 
   'proposta_enviada', 'confirmacao', 100),

  -- Validação tentativas excedidas
  ('sofia', 'validacao_falhou', 'any', 'fail', 
   'Parece que estamos com dificuldade nessa parte. 🤔 Vou chamar um atendente humano para te ajudar, tá bom? Um momento!', 
   'escalar', NULL, 50),

  -- Estados Maria (SAC)
  ('maria', 'triagem', 'categoria', 'success', 
   'Entendi! Vou te direcionar para o setor correto. Um momento...', 
   'roteando', NULL, 100),
  ('maria', 'triagem', 'categoria', 'missing', 
   'Para te ajudar melhor, me conta: sua dúvida é sobre fatura, contrato, ou outro assunto?', 
   'triagem', 'categoria', 100);

-- 6. Comentários para documentação
COMMENT ON TABLE public.deterministic_response_templates IS 'Templates de resposta determinística para bypass da LLM em tarefas de coleta de dados';
COMMENT ON COLUMN public.deterministic_response_templates.current_state IS 'Estado atual do FSM (aguardando_nome, aguardando_email, etc.)';
COMMENT ON COLUMN public.deterministic_response_templates.expected_field IS 'Campo sendo coletado (nome, email, valor, distribuidora)';
COMMENT ON COLUMN public.deterministic_response_templates.validation_result IS 'Resultado da validação: success, fail, invalid_format, missing';
COMMENT ON COLUMN public.deterministic_response_templates.response_template IS 'Template com placeholders: {first_name}, {valor_extraido}, {distribuidora}, etc.';
COMMENT ON COLUMN public.chatbot_conversas.fsm_expected_field IS 'Campo atualmente sendo aguardado pelo router determinístico';
COMMENT ON COLUMN public.chatbot_conversas.field_attempts IS 'Contador de tentativas para o campo atual';