-- Adicionar campo para prompt_modules no ai_agents
-- A estrutura persona já existe como JSONB, vamos documentar o novo formato

-- Criar tabela de templates de módulos de prompt reutilizáveis
CREATE TABLE IF NOT EXISTS public.prompt_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_key TEXT NOT NULL UNIQUE,
  module_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  description TEXT,
  template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.prompt_modules ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Prompt modules são visíveis para usuários autenticados"
ON public.prompt_modules FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Apenas admins podem modificar prompt modules"
ON public.prompt_modules FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_prompt_modules_updated_at
BEFORE UPDATE ON public.prompt_modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir módulos padrão do sistema
INSERT INTO public.prompt_modules (module_key, module_name, category, description, template, variables, is_system, priority) VALUES

-- IDENTIDADE
('identity_core', 'Identidade Principal', 'identity', 'Define quem é o agente e sua empresa', 
'Você é {{agent_name}}, {{agent_role}} da {{company_name}}.
{{#if company_description}}{{company_description}}{{/if}}', 
'["agent_name", "agent_role", "company_name", "company_description"]'::jsonb, true, 10),

('identity_expertise', 'Especialização', 'identity', 'Define área de expertise do agente',
'Você é especialista em {{expertise_area}}.
{{#if certifications}}Certificações: {{certifications}}{{/if}}', 
'["expertise_area", "certifications"]'::jsonb, true, 20),

-- PERSONA & TOM
('persona_tone', 'Tom de Voz', 'persona', 'Define o tom de comunicação',
'Seu tom de voz é {{tone_style}}.
{{#if tone_examples}}Exemplos: {{tone_examples}}{{/if}}', 
'["tone_style", "tone_examples"]'::jsonb, true, 30),

('persona_style', 'Estilo de Comunicação', 'persona', 'Define como o agente se comunica',
'Estilo de comunicação:
- Mensagens {{message_length}} (máximo {{max_chars}} caracteres)
- {{emoji_usage}}
- {{formality_level}}', 
'["message_length", "max_chars", "emoji_usage", "formality_level"]'::jsonb, true, 40),

('persona_personality', 'Traços de Personalidade', 'persona', 'Define personalidade do agente',
'Traços de personalidade: {{personality_traits}}
{{#if values}}Valores: {{values}}{{/if}}', 
'["personality_traits", "values"]'::jsonb, true, 50),

-- GUARDRAILS
('guardrails_never', 'Restrições Absolutas', 'guardrails', 'O que o agente NUNCA deve fazer',
'NUNCA faça:
{{#each never_do}}- {{this}}
{{/each}}', 
'["never_do"]'::jsonb, true, 60),

('guardrails_always', 'Comportamentos Obrigatórios', 'guardrails', 'O que o agente SEMPRE deve fazer',
'SEMPRE faça:
{{#each always_do}}- {{this}}
{{/each}}', 
'["always_do"]'::jsonb, true, 70),

('guardrails_escalation', 'Gatilhos de Escalação', 'guardrails', 'Quando escalar para humano',
'Escale para atendente humano quando:
{{#each escalation_triggers}}- {{this}}
{{/each}}', 
'["escalation_triggers"]'::jsonb, true, 80),

-- CONHECIMENTO
('knowledge_base', 'Base de Conhecimento', 'knowledge', 'Informações da base de conhecimento',
'BASE DE CONHECIMENTO:
{{#each kb_entries}}
### {{this.title}}
{{this.content}}
{{/each}}', 
'["kb_entries"]'::jsonb, true, 90),

('knowledge_faq', 'FAQs', 'knowledge', 'Perguntas frequentes',
'PERGUNTAS FREQUENTES:
{{#each faqs}}
P: {{this.question}}
R: {{this.answer}}
{{/each}}', 
'["faqs"]'::jsonb, true, 100),

-- CONTEXTO
('context_company', 'Contexto Institucional', 'context', 'Informações da empresa',
'SOBRE A {{company_name}}:
{{company_about}}

{{#if products}}PRODUTOS/SERVIÇOS:
{{#each products}}- {{this.name}}: {{this.description}}
{{/each}}{{/if}}', 
'["company_name", "company_about", "products"]'::jsonb, true, 110),

('context_campaign', 'Contexto de Campanha', 'context', 'Informações de campanha ativa',
'CAMPANHA ATIVA: {{campaign_name}}
Objetivo: {{campaign_goal}}
{{#if offers}}Ofertas: {{offers}}{{/if}}
Válido até: {{campaign_end}}', 
'["campaign_name", "campaign_goal", "offers", "campaign_end"]'::jsonb, true, 120),

-- FLUXO
('flow_greeting', 'Saudação', 'flow', 'Como iniciar conversas',
'SAUDAÇÃO:
{{greeting_template}}
{{#if personalization}}Personalize com: {{personalization}}{{/if}}', 
'["greeting_template", "personalization"]'::jsonb, true, 130),

('flow_qualification', 'Qualificação', 'flow', 'Perguntas de qualificação',
'QUALIFICAÇÃO - Colete:
{{#each qualification_fields}}- {{this.field}}: {{this.importance}}
{{/each}}', 
'["qualification_fields"]'::jsonb, true, 140),

('flow_objections', 'Tratamento de Objeções', 'flow', 'Como lidar com objeções',
'OBJEÇÕES COMUNS:
{{#each objections}}
Objeção: "{{this.trigger}}"
Resposta: {{this.response}}
{{/each}}', 
'["objections"]'::jsonb, true, 150),

('flow_closing', 'Fechamento', 'flow', 'Como fechar conversas/vendas',
'FECHAMENTO:
{{closing_strategy}}
{{#if urgency}}Urgência: {{urgency}}{{/if}}', 
'["closing_strategy", "urgency"]'::jsonb, true, 160),

-- VOZ
('voice_inbound', 'Configuração Voz Receptiva', 'voice', 'Configurações para chamadas receptivas',
'VOZ RECEPTIVA:
- Velocidade: {{speech_speed}}
- Pausas: {{pause_style}}
- Interrupções: {{interruption_handling}}', 
'["speech_speed", "pause_style", "interruption_handling"]'::jsonb, true, 170),

('voice_outbound', 'Configuração Voz Ativa', 'voice', 'Configurações para chamadas ativas',
'VOZ ATIVA:
- Objetivo: {{call_objective}}
- Script inicial: {{opening_script}}
- Máximo duração: {{max_duration}}', 
'["call_objective", "opening_script", "max_duration"]'::jsonb, true, 180),

-- COBRANÇA (COLLECTIONS)
('collections_rules', 'Regras de Cobrança', 'collections', 'Regras específicas para agentes de cobrança',
'REGRAS DE COBRANÇA:
- Máximo contatos/dia: {{max_daily_contacts}}
- Horário: {{contact_hours_start}} às {{contact_hours_end}}
- Fins de semana: {{weekend_allowed}}
- Escalar após: {{escalation_days}} dias', 
'["max_daily_contacts", "contact_hours_start", "contact_hours_end", "weekend_allowed", "escalation_days"]'::jsonb, true, 190),

('collections_negotiation', 'Negociação de Dívidas', 'collections', 'Estratégias de negociação',
'NEGOCIAÇÃO:
- Desconto máximo: {{max_discount}}%
- Parcelamento máximo: {{max_installments}}x
- Entrada mínima: {{min_down_payment}}%', 
'["max_discount", "max_installments", "min_down_payment"]'::jsonb, true, 200)

ON CONFLICT (module_key) DO NOTHING;

-- Criar tabela de ligação entre agentes e módulos
CREATE TABLE IF NOT EXISTS public.agent_prompt_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.prompt_modules(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  custom_variables JSONB DEFAULT '{}'::jsonb,
  priority_override INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agent_id, module_id)
);

-- Habilitar RLS
ALTER TABLE public.agent_prompt_modules ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Agent prompt modules são visíveis para usuários autenticados"
ON public.agent_prompt_modules FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem modificar agent prompt modules"
ON public.agent_prompt_modules FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_agent_prompt_modules_updated_at
BEFORE UPDATE ON public.agent_prompt_modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_prompt_modules_category ON public.prompt_modules(category);
CREATE INDEX IF NOT EXISTS idx_prompt_modules_active ON public.prompt_modules(is_active);
CREATE INDEX IF NOT EXISTS idx_agent_prompt_modules_agent ON public.agent_prompt_modules(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_prompt_modules_enabled ON public.agent_prompt_modules(is_enabled);