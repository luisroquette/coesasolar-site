
-- ═══════════════════════════════════════════════════════════════
-- MIGRAÇÃO: Correção RLS Sprint 2 + Security Invoker Views
-- Data: 2026-02-02
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- PARTE 1: RECRIAR VIEWS COM SECURITY INVOKER = TRUE
-- ═══════════════════════════════════════════════════════════════

-- Drop e recria v_funnel_by_source
DROP VIEW IF EXISTS public.v_funnel_by_source;
CREATE OR REPLACE VIEW public.v_funnel_by_source
WITH (security_invoker = true)
AS
SELECT COALESCE(lead_source, 'desconhecido'::text) AS fonte,
    count(*) AS total_leads,
    count(*) FILTER (WHERE (proposta_link_sent_at IS NOT NULL)) AS com_proposta,
    count(*) FILTER (WHERE (contrato_assinado = true)) AS convertidos,
    CASE
        WHEN (count(*) > 0) THEN round((((count(*) FILTER (WHERE (contrato_assinado = true)))::numeric / (count(*))::numeric) * (100)::numeric), 2)
        ELSE (0)::numeric
    END AS taxa_conversao
FROM chatbot_conversas
WHERE ((created_at >= (CURRENT_DATE - '30 days'::interval)) AND (bitrix24_lead_id IS NOT NULL))
GROUP BY lead_source
ORDER BY (count(*)) DESC;

-- Drop e recria v_funnel_conversion_rates
DROP VIEW IF EXISTS public.v_funnel_conversion_rates;
CREATE OR REPLACE VIEW public.v_funnel_conversion_rates
WITH (security_invoker = true)
AS
WITH stage_transitions AS (
    SELECT count(*) FILTER (WHERE (chatbot_conversas.bitrix24_lead_id IS NOT NULL)) AS total_leads,
        count(*) FILTER (WHERE (chatbot_conversas.proposta_link_sent_at IS NOT NULL)) AS com_proposta_inicial,
        count(*) FILTER (WHERE (chatbot_conversas.proposta_id IS NOT NULL)) AS com_proposta,
        count(*) FILTER (WHERE (chatbot_conversas.all_docs_complete_at IS NOT NULL)) AS docs_completos,
        count(*) FILTER (WHERE (chatbot_conversas.contrato_enviado_at IS NOT NULL)) AS contrato_enviado,
        count(*) FILTER (WHERE (chatbot_conversas.contrato_assinado = true)) AS contrato_assinado
    FROM chatbot_conversas
    WHERE (chatbot_conversas.created_at >= (CURRENT_DATE - '30 days'::interval))
)
SELECT total_leads,
    com_proposta_inicial,
    com_proposta,
    docs_completos,
    contrato_enviado,
    contrato_assinado,
    CASE
        WHEN (total_leads > 0) THEN round((((com_proposta_inicial)::numeric / (total_leads)::numeric) * (100)::numeric), 2)
        ELSE (0)::numeric
    END AS taxa_lead_to_proposta,
    CASE
        WHEN (com_proposta_inicial > 0) THEN round((((docs_completos)::numeric / (com_proposta_inicial)::numeric) * (100)::numeric), 2)
        ELSE (0)::numeric
    END AS taxa_proposta_to_docs,
    CASE
        WHEN (docs_completos > 0) THEN round((((contrato_enviado)::numeric / (docs_completos)::numeric) * (100)::numeric), 2)
        ELSE (0)::numeric
    END AS taxa_docs_to_contrato,
    CASE
        WHEN (contrato_enviado > 0) THEN round((((contrato_assinado)::numeric / (contrato_enviado)::numeric) * (100)::numeric), 2)
        ELSE (0)::numeric
    END AS taxa_contrato_to_assinado,
    CASE
        WHEN (total_leads > 0) THEN round((((contrato_assinado)::numeric / (total_leads)::numeric) * (100)::numeric), 2)
        ELSE (0)::numeric
    END AS taxa_conversao_total
FROM stage_transitions;

-- Drop e recria v_funnel_daily
DROP VIEW IF EXISTS public.v_funnel_daily;
CREATE OR REPLACE VIEW public.v_funnel_daily
WITH (security_invoker = true)
AS
SELECT date(created_at) AS data,
    count(*) AS novos_leads,
    count(*) FILTER (WHERE ((proposta_link_sent_at IS NOT NULL) AND (date(proposta_link_sent_at) = date(created_at)))) AS propostas_mesmo_dia,
    count(*) FILTER (WHERE ((contrato_assinado = true) AND (date(contrato_assinado_at) = date(created_at)))) AS assinaturas_mesmo_dia,
    count(*) FILTER (WHERE ((ended_at IS NOT NULL) AND (contrato_assinado IS NOT TRUE))) AS leads_perdidos
FROM chatbot_conversas
WHERE ((created_at >= (CURRENT_DATE - '30 days'::interval)) AND (bitrix24_lead_id IS NOT NULL))
GROUP BY (date(created_at))
ORDER BY (date(created_at)) DESC;

-- Drop e recria v_funnel_dropoff
DROP VIEW IF EXISTS public.v_funnel_dropoff;
CREATE OR REPLACE VIEW public.v_funnel_dropoff
WITH (security_invoker = true)
AS
SELECT
    CASE
        WHEN (contrato_assinado = true) THEN 'CONVERTIDO'::text
        WHEN (contrato_enviado_at IS NOT NULL) THEN 'AGUARDANDO_ASSINATURA'::text
        WHEN (all_docs_complete_at IS NOT NULL) THEN 'DOCS_OK_SEM_CONTRATO'::text
        WHEN (proposta_id IS NOT NULL) THEN 'PROPOSTA_SEM_DOCS'::text
        WHEN (proposta_link_sent_at IS NOT NULL) THEN 'LINK_ENVIADO_SEM_PROPOSTA'::text
        WHEN (bitrix24_lead_id IS NOT NULL) THEN 'LEAD_SEM_PROPOSTA'::text
        ELSE 'SEM_LEAD'::text
    END AS dropoff_stage,
    count(*) AS quantidade,
    round((((count(*))::numeric / NULLIF(sum(count(*)) OVER (), (0)::numeric)) * (100)::numeric), 2) AS percentual,
    avg((EXTRACT(epoch FROM (COALESCE(ended_at, now()) - created_at)) / (86400)::numeric)) AS avg_dias_no_stage
FROM chatbot_conversas
WHERE (created_at >= (CURRENT_DATE - '30 days'::interval))
GROUP BY
    CASE
        WHEN (contrato_assinado = true) THEN 'CONVERTIDO'::text
        WHEN (contrato_enviado_at IS NOT NULL) THEN 'AGUARDANDO_ASSINATURA'::text
        WHEN (all_docs_complete_at IS NOT NULL) THEN 'DOCS_OK_SEM_CONTRATO'::text
        WHEN (proposta_id IS NOT NULL) THEN 'PROPOSTA_SEM_DOCS'::text
        WHEN (proposta_link_sent_at IS NOT NULL) THEN 'LINK_ENVIADO_SEM_PROPOSTA'::text
        WHEN (bitrix24_lead_id IS NOT NULL) THEN 'LEAD_SEM_PROPOSTA'::text
        ELSE 'SEM_LEAD'::text
    END
ORDER BY (count(*)) DESC;

-- Drop e recria v_funnel_stage_counts
DROP VIEW IF EXISTS public.v_funnel_stage_counts;
CREATE OR REPLACE VIEW public.v_funnel_stage_counts
WITH (security_invoker = true)
AS
SELECT 
    count(*) FILTER (WHERE bitrix24_lead_id IS NOT NULL) AS total_leads,
    count(*) FILTER (WHERE proposta_link_sent_at IS NOT NULL) AS link_enviado,
    count(*) FILTER (WHERE proposta_id IS NOT NULL) AS proposta_criada,
    count(*) FILTER (WHERE all_docs_complete_at IS NOT NULL) AS docs_completos,
    count(*) FILTER (WHERE contrato_enviado_at IS NOT NULL) AS contrato_enviado,
    count(*) FILTER (WHERE contrato_assinado = true) AS contrato_assinado
FROM chatbot_conversas
WHERE created_at >= (CURRENT_DATE - '30 days'::interval);

-- Drop e recria v_funnel_stage_duration
DROP VIEW IF EXISTS public.v_funnel_stage_duration;
CREATE OR REPLACE VIEW public.v_funnel_stage_duration
WITH (security_invoker = true)
AS
SELECT 
    'lead_to_link' AS stage,
    avg(EXTRACT(epoch FROM (proposta_link_sent_at - created_at)) / 3600) AS avg_hours,
    count(*) FILTER (WHERE proposta_link_sent_at IS NOT NULL) AS count
FROM chatbot_conversas
WHERE created_at >= (CURRENT_DATE - '30 days'::interval) AND proposta_link_sent_at IS NOT NULL
UNION ALL
SELECT 
    'link_to_docs' AS stage,
    avg(EXTRACT(epoch FROM (all_docs_complete_at - proposta_link_sent_at)) / 3600) AS avg_hours,
    count(*) FILTER (WHERE all_docs_complete_at IS NOT NULL) AS count
FROM chatbot_conversas
WHERE created_at >= (CURRENT_DATE - '30 days'::interval) AND all_docs_complete_at IS NOT NULL
UNION ALL
SELECT 
    'docs_to_contract' AS stage,
    avg(EXTRACT(epoch FROM (contrato_enviado_at - all_docs_complete_at)) / 3600) AS avg_hours,
    count(*) FILTER (WHERE contrato_enviado_at IS NOT NULL) AS count
FROM chatbot_conversas
WHERE created_at >= (CURRENT_DATE - '30 days'::interval) AND contrato_enviado_at IS NOT NULL
UNION ALL
SELECT 
    'contract_to_signed' AS stage,
    avg(EXTRACT(epoch FROM (contrato_assinado_at - contrato_enviado_at)) / 3600) AS avg_hours,
    count(*) FILTER (WHERE contrato_assinado = true) AS count
FROM chatbot_conversas
WHERE created_at >= (CURRENT_DATE - '30 days'::interval) AND contrato_assinado = true;

-- Drop e recria v_funnel_weekly_comparison
DROP VIEW IF EXISTS public.v_funnel_weekly_comparison;
CREATE OR REPLACE VIEW public.v_funnel_weekly_comparison
WITH (security_invoker = true)
AS
SELECT 
    'current_week' AS period,
    count(*) FILTER (WHERE bitrix24_lead_id IS NOT NULL) AS leads,
    count(*) FILTER (WHERE proposta_link_sent_at IS NOT NULL) AS propostas,
    count(*) FILTER (WHERE contrato_assinado = true) AS conversoes
FROM chatbot_conversas
WHERE created_at >= date_trunc('week', CURRENT_DATE)
UNION ALL
SELECT 
    'previous_week' AS period,
    count(*) FILTER (WHERE bitrix24_lead_id IS NOT NULL) AS leads,
    count(*) FILTER (WHERE proposta_link_sent_at IS NOT NULL) AS propostas,
    count(*) FILTER (WHERE contrato_assinado = true) AS conversoes
FROM chatbot_conversas
WHERE created_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 days'
  AND created_at < date_trunc('week', CURRENT_DATE);

-- ═══════════════════════════════════════════════════════════════
-- PARTE 2: CORRIGIR POLÍTICAS RLS - TABELAS ADMIN
-- ═══════════════════════════════════════════════════════════════

-- AGENT_PROMPT_MODULES: Remover USING(true) e adicionar is_admin()
DROP POLICY IF EXISTS "Agent prompt modules são visíveis para usuários autenticados" ON agent_prompt_modules;
DROP POLICY IF EXISTS "Usuários autenticados podem modificar agent prompt modules" ON agent_prompt_modules;

CREATE POLICY "Admins can view agent_prompt_modules"
ON public.agent_prompt_modules FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert agent_prompt_modules"
ON public.agent_prompt_modules FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update agent_prompt_modules"
ON public.agent_prompt_modules FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete agent_prompt_modules"
ON public.agent_prompt_modules FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));

-- AGENT_SECRETS: Remover USING(true) e adicionar is_admin()
DROP POLICY IF EXISTS "Authenticated users can manage agent secrets" ON agent_secrets;
DROP POLICY IF EXISTS "Authenticated users can view agent secrets metadata" ON agent_secrets;

CREATE POLICY "Admins can view agent_secrets"
ON public.agent_secrets FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert agent_secrets"
ON public.agent_secrets FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update agent_secrets"
ON public.agent_secrets FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete agent_secrets"
ON public.agent_secrets FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));

-- BUSINESS_RULES_GUARDRAILS: Mudar para is_admin() em modificações, manter SELECT para service_role
DROP POLICY IF EXISTS "Business rules are readable by authenticated users" ON business_rules_guardrails;

-- SELECT: service_role ou admin (para edge functions lerem as regras)
CREATE POLICY "Service role or admin can view business_rules"
ON public.business_rules_guardrails FOR SELECT
TO authenticated
USING (is_admin(auth.uid()) OR (auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Admins can insert business_rules"
ON public.business_rules_guardrails FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update business_rules"
ON public.business_rules_guardrails FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete business_rules"
ON public.business_rules_guardrails FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));

-- PROMPT_MODULES: Remover USING(true) e adicionar is_admin()
DROP POLICY IF EXISTS "Apenas admins podem modificar prompt modules" ON prompt_modules;
DROP POLICY IF EXISTS "Prompt modules são visíveis para usuários autenticados" ON prompt_modules;

-- SELECT: service_role ou admin (para edge functions lerem os módulos)
CREATE POLICY "Service role or admin can view prompt_modules"
ON public.prompt_modules FOR SELECT
TO authenticated
USING (is_admin(auth.uid()) OR (auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Admins can insert prompt_modules"
ON public.prompt_modules FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update prompt_modules"
ON public.prompt_modules FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete prompt_modules"
ON public.prompt_modules FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));

-- CONFIGURACOES_SISTEMA: Adicionar is_admin() para modificações
DROP POLICY IF EXISTS "Authenticated users can insert configs" ON configuracoes_sistema;
DROP POLICY IF EXISTS "Authenticated users can update configs" ON configuracoes_sistema;
DROP POLICY IF EXISTS "Authenticated users can view configs" ON configuracoes_sistema;

-- SELECT: qualquer autenticado pode ler configs (necessário para o sistema funcionar)
CREATE POLICY "Authenticated users can view configs"
ON public.configuracoes_sistema FOR SELECT
TO authenticated
USING (true);

-- INSERT/UPDATE/DELETE: apenas admins
CREATE POLICY "Admins can insert configs"
ON public.configuracoes_sistema FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update configs"
ON public.configuracoes_sistema FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete configs"
ON public.configuracoes_sistema FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));

-- OUTBOUND_CAMPAIGNS: Corrigir para is_admin()
DROP POLICY IF EXISTS "Authenticated users can create campaigns" ON outbound_campaigns;
DROP POLICY IF EXISTS "Authenticated users can delete campaigns" ON outbound_campaigns;
DROP POLICY IF EXISTS "Authenticated users can update campaigns" ON outbound_campaigns;
DROP POLICY IF EXISTS "Authenticated users can view campaigns" ON outbound_campaigns;
-- Manter service_role policy
-- DROP POLICY IF EXISTS "Service role full access campaigns" ON outbound_campaigns;

CREATE POLICY "Admins can view campaigns"
ON public.outbound_campaigns FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert campaigns"
ON public.outbound_campaigns FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update campaigns"
ON public.outbound_campaigns FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete campaigns"
ON public.outbound_campaigns FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));
