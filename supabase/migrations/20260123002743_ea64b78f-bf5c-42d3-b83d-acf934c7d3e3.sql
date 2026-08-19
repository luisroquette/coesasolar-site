-- ═══════════════════════════════════════════════════════════════
-- FASE 4: ZERO HARDCODE - Mensagens de Dados, Divergências, Labels e Constantes
-- ═══════════════════════════════════════════════════════════════

-- 1. MENSAGENS DE DADOS/PENDÊNCIAS (identifyMissingDataForTask)
INSERT INTO public.sofia_message_templates (category, subcategory, template_key, template_text, variables, priority, description)
VALUES 
  ('data_collection', 'missing_field', 'nome', 'Para eu gerar sua proposta personalizada, preciso saber seu nome completo. Como posso te chamar?', ARRAY[]::text[], 100, 'Pergunta para coletar nome'),
  ('data_collection', 'missing_field', 'email', 'Qual o seu e-mail? Vou precisar dele para te enviar a proposta e o contrato.', ARRAY[]::text[], 100, 'Pergunta para coletar email'),
  ('data_collection', 'missing_field', 'valorFatura', 'Qual o valor aproximado da sua última conta de luz? (pode ser só o número, ex: 500)', ARRAY[]::text[], 100, 'Pergunta para coletar valor da fatura'),
  ('data_collection', 'missing_field', 'distribuidora', 'Qual a sua distribuidora de energia? (Ex: CEMIG, ENEL, LIGHT, COPEL, ENERGISA)', ARRAY[]::text[], 100, 'Pergunta para coletar distribuidora'),
  ('data_collection', 'missing_field', 'consumo', 'Qual o consumo aproximado em kWh da sua última conta de luz?', ARRAY[]::text[], 100, 'Pergunta para coletar consumo'),
  ('data_collection', 'missing_field', 'cep', 'Qual o CEP do local de instalação?', ARRAY[]::text[], 100, 'Pergunta para coletar CEP')
ON CONFLICT (category, template_key) DO UPDATE SET 
  template_text = EXCLUDED.template_text,
  description = EXCLUDED.description,
  updated_at = now();

-- 2. MENSAGENS DE DIVERGÊNCIAS (gerarMensagemDivergencias)
INSERT INTO public.sofia_message_templates (category, subcategory, template_key, template_text, variables, priority, description)
VALUES 
  ('divergence', 'intro', 'variant_1', '📋 *Olha só*, percebi algumas diferenças entre o que você informou e os dados do documento:', ARRAY[]::text[], 100, 'Intro divergência - tom amigável'),
  ('divergence', 'intro', 'variant_2', '📋 *Confirmando* alguns dados que encontrei no documento:', ARRAY[]::text[], 100, 'Intro divergência - tom profissional'),
  ('divergence', 'intro', 'variant_3', '📋 Vi que alguns dados do documento são *diferentes* do que você mencionou:', ARRAY[]::text[], 100, 'Intro divergência - tom direto'),
  ('divergence', 'field', 'nome', '• *Nome:* {valor_antigo} → {valor_novo}', ARRAY['valor_antigo', 'valor_novo']::text[], 100, 'Campo divergente - Nome'),
  ('divergence', 'field', 'cpf', '• *CPF:* {valor_antigo} → {valor_novo}', ARRAY['valor_antigo', 'valor_novo']::text[], 100, 'Campo divergente - CPF'),
  ('divergence', 'field', 'cnpj', '• *CNPJ:* {valor_antigo} → {valor_novo}', ARRAY['valor_antigo', 'valor_novo']::text[], 100, 'Campo divergente - CNPJ'),
  ('divergence', 'field', 'consumo', '• *Consumo:* {valor_antigo} kWh → {valor_novo} kWh', ARRAY['valor_antigo', 'valor_novo']::text[], 100, 'Campo divergente - Consumo'),
  ('divergence', 'field', 'valor_fatura', '• *Valor da Fatura:* R$ {valor_antigo} → R$ {valor_novo}', ARRAY['valor_antigo', 'valor_novo']::text[], 100, 'Campo divergente - Valor Fatura'),
  ('divergence', 'field', 'distribuidora', '• *Distribuidora:* {valor_antigo} → {valor_novo}', ARRAY['valor_antigo', 'valor_novo']::text[], 100, 'Campo divergente - Distribuidora'),
  ('divergence', 'field', 'instalacao', '• *Nº Instalação:* {valor_antigo} → {valor_novo}', ARRAY['valor_antigo', 'valor_novo']::text[], 100, 'Campo divergente - Instalação'),
  ('divergence', 'closing', 'confirmation', '

Qual dado está correto? *O que você informou antes* ou *o do documento*?', ARRAY[]::text[], 100, 'Fechamento divergência - pedindo confirmação'),
  ('divergence', 'closing', 'update_notice', '

Vou atualizar com os dados do documento, ok? 😊', ARRAY[]::text[], 100, 'Fechamento divergência - aviso de atualização')
ON CONFLICT (category, template_key) DO UPDATE SET 
  template_text = EXCLUDED.template_text,
  description = EXCLUDED.description,
  updated_at = now();

-- 3. MENSAGENS DE TIMEOUT/CONTINUAÇÃO
INSERT INTO public.sofia_message_templates (category, subcategory, template_key, template_text, variables, priority, description)
VALUES 
  ('timeout', 'task', 'retry_message', 'Desculpa a demora! Estou verificando um detalhe técnico aqui. Enquanto isso, posso te ajudar com mais alguma dúvida? 😊', ARRAY[]::text[], 100, 'Mensagem quando tarefa pendente falha'),
  ('timeout', 'task', 'continuation_message', 'Oi! Tô aqui sim! 😊 Me conta, como posso te ajudar agora?', ARRAY[]::text[], 100, 'Mensagem de continuação após timeout'),
  ('status', 'not_found', 'no_conversation', '❌ *Nenhuma conversa ativa encontrada*

Envie qualquer mensagem para iniciar uma nova conversa.', ARRAY[]::text[], 100, 'Status quando não há conversa ativa')
ON CONFLICT (category, template_key) DO UPDATE SET 
  template_text = EXCLUDED.template_text,
  description = EXCLUDED.description,
  updated_at = now();

-- 4. LABELS DE CATEGORIA RAG (buildRAGFirstPromptSection)
-- Criar tabela para labels dinâmicos
CREATE TABLE IF NOT EXISTS public.rag_category_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key text NOT NULL UNIQUE,
  display_label text NOT NULL,
  priority int DEFAULT 50,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Adicionar RLS
ALTER TABLE public.rag_category_labels ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública (edge functions precisam)
CREATE POLICY "Allow public read for rag_category_labels" ON public.rag_category_labels
  FOR SELECT USING (true);

-- Inserir labels padrão
INSERT INTO public.rag_category_labels (category_key, display_label, priority) VALUES
  ('kb_vendas', 'Base de Conhecimento Comercial', 100),
  ('faq', 'Perguntas Frequentes', 95),
  ('objecoes', 'Tratamento de Objeções', 90),
  ('scripts', 'Scripts de Conversão', 85),
  ('politicas', 'Políticas e Regras', 80),
  ('institucional', 'Informações Institucionais', 75),
  ('planos', 'Planos Comerciais', 70),
  ('guardrails', 'Guardrails e Limites', 65),
  ('credibilidade', 'Credibilidade e Confiança', 60),
  ('financeiro', 'Informações Financeiras', 55),
  ('contratos', 'Informações de Contratos', 50),
  ('tecnologia', 'Informações Técnicas', 45)
ON CONFLICT (category_key) DO UPDATE SET 
  display_label = EXCLUDED.display_label,
  priority = EXCLUDED.priority,
  updated_at = now();

-- 5. CONSTANTES DE CONFIGURAÇÃO
-- Adicionar à tabela configuracoes_sistema
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('pending_task_timeout_ms', '180000', 'Timeout para tarefas pendentes em milissegundos (3 min)'),
  ('max_task_retries', '2', 'Número máximo de tentativas para tarefa pendente'),
  ('rag_min_message_length', '8', 'Comprimento mínimo de mensagem para trigger RAG'),
  ('rag_cache_ttl_ms', '120000', 'TTL do cache RAG em milissegundos (2 min)'),
  ('distribuidora_cache_ttl_ms', '600000', 'TTL do cache de distribuidoras em milissegundos (10 min)'),
  ('agent_cache_ttl_ms', '300000', 'TTL do cache de agentes em milissegundos (5 min)'),
  ('template_cache_ttl_ms', '300000', 'TTL do cache de templates em milissegundos (5 min)'),
  ('divergence_tolerance_percent', '5', 'Tolerância percentual para comparação de valores numéricos')
ON CONFLICT (chave) DO UPDATE SET 
  valor = EXCLUDED.valor,
  descricao = EXCLUDED.descricao,
  updated_at = now();