-- ================================================================
-- CRITICAL BUSINESS RULES GUARDRAILS - Phase 47
-- Move critical rules from RAG to deterministic enforcement
-- ================================================================

-- 1. Create business rules guardrails table
CREATE TABLE IF NOT EXISTS public.business_rules_guardrails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  description TEXT NOT NULL,
  enforcement_point TEXT NOT NULL CHECK (enforcement_point IN ('pre_llm', 'post_llm', 'both')),
  severity TEXT NOT NULL DEFAULT 'critical' CHECK (severity IN ('critical', 'error', 'warning', 'info')),
  
  -- Pattern matching
  trigger_patterns JSONB DEFAULT '[]'::jsonb,  -- Regex patterns that trigger this rule
  block_patterns JSONB DEFAULT '[]'::jsonb,    -- Patterns that indicate violation
  
  -- Actions
  action_type TEXT NOT NULL DEFAULT 'block' CHECK (action_type IN ('block', 'replace', 'flag', 'log')),
  replacement_template TEXT,                    -- Message to use when replacing
  
  -- Scope
  agent_ids TEXT[] DEFAULT '{}',               -- Empty = all agents
  funnel_stages TEXT[] DEFAULT '{}',           -- Empty = all stages
  
  -- Control
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 50,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.business_rules_guardrails ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Business rules are readable by authenticated users"
  ON public.business_rules_guardrails
  FOR SELECT
  USING (true);

-- 2. Create guardrail events log for audit
CREATE TABLE IF NOT EXISTS public.sofia_guardrail_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code TEXT NOT NULL,
  rule_name TEXT,
  enforcement_point TEXT NOT NULL,
  severity TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  
  -- Context
  conversa_id UUID,
  client_phone TEXT,
  agent_id TEXT DEFAULT 'sofia',
  
  -- Details
  original_message TEXT,
  original_response TEXT,
  replaced_response TEXT,
  trigger_match TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sofia_guardrail_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guardrail events are readable by authenticated users"
  ON public.sofia_guardrail_events
  FOR SELECT
  USING (true);

-- 3. Insert critical business rules (from "Cláusulas Pétreas")

-- RULE 1: Document collection ONLY via platform link
INSERT INTO business_rules_guardrails (
  rule_code, rule_name, description, enforcement_point, severity,
  trigger_patterns, block_patterns, action_type, replacement_template, priority
) VALUES (
  'DOCS_VIA_PLATFORM_ONLY',
  'Documentos apenas via plataforma',
  'Documentos (RG, CNH, fatura, contrato social) devem ser enviados EXCLUSIVAMENTE pelo link da proposta, nunca pelo WhatsApp',
  'post_llm',
  'critical',
  '[]'::jsonb,
  '["(envi[ae]|mand[ae]|anexe).{0,30}(documento|rg|cnh|fatura|contrato)", "(documento|rg|cnh).{0,30}(aqui|whatsapp|por aqui)", "aguardando.{0,30}(documento|foto|pdf)"]'::jsonb,
  'replace',
  'Para sua segurança, os documentos devem ser enviados através do link da sua proposta! 🔒\n\nAcesse o link que você recebeu e clique em "Quero minha Proposta Definitiva" para anexar os arquivos de forma segura.\n\nIsso protege seus dados pessoais! 💚',
  100
) ON CONFLICT (rule_code) DO UPDATE SET 
  block_patterns = EXCLUDED.block_patterns,
  replacement_template = EXCLUDED.replacement_template;

-- RULE 2: Email obrigatório antes da proposta
INSERT INTO business_rules_guardrails (
  rule_code, rule_name, description, enforcement_point, severity,
  trigger_patterns, block_patterns, action_type, replacement_template, priority
) VALUES (
  'EMAIL_BEFORE_PROPOSAL',
  'E-mail obrigatório antes de proposta',
  'O e-mail do cliente deve ser coletado ANTES de prometer ou gerar qualquer proposta',
  'post_llm',
  'critical',
  '["proposta", "simula", "economia"]'::jsonb,
  '["vou.{0,15}enviar.{0,20}proposta", "sua proposta.{0,15}(pronta|enviada)", "preparando.{0,15}proposta", "link.{0,10}proposta", "segue.{0,15}proposta"]'::jsonb,
  'replace',
  'Para preparar sua proposta personalizada, preciso do seu *e-mail*! 📧\n\nAssim você recebe todos os detalhes da economia que podemos oferecer.\n\nQual é o seu e-mail?',
  95
) ON CONFLICT (rule_code) DO UPDATE SET 
  block_patterns = EXCLUDED.block_patterns;

-- RULE 3: Valor mínimo R$ 300
INSERT INTO business_rules_guardrails (
  rule_code, rule_name, description, enforcement_point, severity,
  block_patterns, action_type, replacement_template, priority
) VALUES (
  'MINIMUM_BILL_300',
  'Linha de corte R$ 300',
  'Contas abaixo de R$ 300 são automaticamente desqualificadas por inviabilidade comercial',
  'pre_llm',
  'critical',
  '[]'::jsonb,
  'block',
  'Agradeço seu interesse! 💚\n\nAnalisando os dados, infelizmente sua conta está abaixo do nosso limite mínimo de R$ 300 para adesão ao programa de economia.\n\nIsso acontece porque os custos operacionais tornam inviável oferecer desconto para contas menores.\n\nSe sua conta aumentar no futuro, estamos à disposição! 😊',
  100
) ON CONFLICT (rule_code) DO UPDATE SET 
  replacement_template = EXCLUDED.replacement_template;

-- RULE 4: Triagem única (máximo 1 tentativa)
INSERT INTO business_rules_guardrails (
  rule_code, rule_name, description, enforcement_point, severity,
  block_patterns, action_type, priority
) VALUES (
  'SINGLE_TRIAGE_ATTEMPT',
  'Triagem única',
  'A triagem deve ser executada no máximo 1 vez. Após isso, assume-se novo cliente.',
  'pre_llm',
  'error',
  '["já é cliente", "você é cliente", "cliente ou quer ser"]'::jsonb,
  'flag',
  90
) ON CONFLICT (rule_code) DO UPDATE SET 
  description = EXCLUDED.description;

-- RULE 5: Contexto de terceiros é válido
INSERT INTO business_rules_guardrails (
  rule_code, rule_name, description, enforcement_point, severity,
  trigger_patterns, action_type, priority
) VALUES (
  'THIRD_PARTY_CONTEXT_VALID',
  'Contexto de terceiros é válido',
  'Menções como "casa do sogro", "da minha mãe", "do meu pai" são contextos válidos e NÃO devem disparar triagem de "sem conta"',
  'pre_llm',
  'warning',
  '["casa.{0,10}(sogro|sogra|mãe|pai|avó|avô|filho|filha|irmão|irmã)", "conta.{0,10}(do|da) (meu|minha)", "fatura.{0,10}(do|da) (meu|minha)"]'::jsonb,
  'flag',
  85
) ON CONFLICT (rule_code) DO UPDATE SET 
  trigger_patterns = EXCLUDED.trigger_patterns;

-- RULE 6: Proibição de promessas redundantes
INSERT INTO business_rules_guardrails (
  rule_code, rule_name, description, enforcement_point, severity,
  block_patterns, action_type, priority
) VALUES (
  'NO_REDUNDANT_PROMISES',
  'Proibição de promessas redundantes',
  'Não repetir "link em instantes" se já foi enviado. Não prometer proposta se já existe proposta_id.',
  'post_llm',
  'warning',
  '["vou enviar.{0,15}link", "link.{0,10}instantes", "já já envio"]'::jsonb,
  'flag',
  80
) ON CONFLICT (rule_code) DO UPDATE SET 
  block_patterns = EXCLUDED.block_patterns;

-- RULE 7: Funil de fases obrigatório
INSERT INTO business_rules_guardrails (
  rule_code, rule_name, description, enforcement_point, severity,
  action_type, priority
) VALUES (
  'FUNNEL_ORDER_MANDATORY',
  'Ordem de funil obrigatória',
  'Qualificação → Mínimo R$300 → E-mail → Proposta Inicial → Documentos (via plataforma) → Proposta Definitiva',
  'both',
  'critical',
  'flag',
  100
) ON CONFLICT (rule_code) DO UPDATE SET 
  description = EXCLUDED.description;

-- RULE 8: Desconto entre 15% e 30%
INSERT INTO business_rules_guardrails (
  rule_code, rule_name, description, enforcement_point, severity,
  block_patterns, action_type, priority
) VALUES (
  'DISCOUNT_RANGE_15_30',
  'Faixa de desconto 15%-30%',
  'Descontos mencionados devem estar entre 15% (Flex) e 30% (UNLOCK). Valores fora dessa faixa são alucinação.',
  'post_llm',
  'error',
  '["([3-9][1-9]|[4-9]0|100)\\s*%\\s*(de\\s+)?(economia|desconto)", "(5|[6-9]|1[0-4])\\s*%\\s*(de\\s+)?(economia|desconto)"]'::jsonb,
  'flag',
  85
) ON CONFLICT (rule_code) DO UPDATE SET 
  block_patterns = EXCLUDED.block_patterns;

-- RULE 9: Não inventar URLs de proposta
INSERT INTO business_rules_guardrails (
  rule_code, rule_name, description, enforcement_point, severity,
  block_patterns, action_type, replacement_template, priority
) VALUES (
  'NO_FAKE_PROPOSAL_URLS',
  'Proibido inventar URLs de proposta',
  'URLs de proposta contêm UUID e são geradas pelo SISTEMA. A IA nunca deve criar ou mencionar URLs.',
  'post_llm',
  'critical',
  '["https?://[^\\s]+proposta[^\\s]*", "coesa[^\\s]*\\.app[^\\s]*", "lovable\\.app[^\\s]*proposta"]'::jsonb,
  'replace',
  'Sua proposta está sendo preparada pelo sistema! 📋\n\nAssim que estiver pronta, você receberá o link automaticamente. Aguarde só mais um pouquinho! 💚',
  95
) ON CONFLICT (rule_code) DO UPDATE SET 
  block_patterns = EXCLUDED.block_patterns;

-- RULE 10: Não confirmar documentos não recebidos
INSERT INTO business_rules_guardrails (
  rule_code, rule_name, description, enforcement_point, severity,
  block_patterns, action_type, priority
) VALUES (
  'NO_FAKE_DOC_CONFIRMATION',
  'Não confirmar documentos não recebidos',
  'Nunca afirmar que recebeu documentos se arquivos_anexados está vazio ou não contém o documento mencionado.',
  'post_llm',
  'critical',
  '["recebi.{0,20}(documento|rg|cnh|fatura|foto)", "(documento|fatura).{0,10}recebid", "confirmado.{0,10}(recebimento|documento)"]'::jsonb,
  'flag',
  90
) ON CONFLICT (rule_code) DO UPDATE SET 
  block_patterns = EXCLUDED.block_patterns;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_guardrails_active ON business_rules_guardrails(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_guardrails_enforcement ON business_rules_guardrails(enforcement_point);
CREATE INDEX IF NOT EXISTS idx_guardrail_events_conversa ON sofia_guardrail_events(conversa_id);
CREATE INDEX IF NOT EXISTS idx_guardrail_events_created ON sofia_guardrail_events(created_at DESC);

-- 5. Add config flag
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES ('guardrails_deterministic_enabled', 'true', 'Habilita guardrails determinísticos (pré e pós-LLM) carregados do banco de dados')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;