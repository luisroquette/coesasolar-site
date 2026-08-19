-- =====================================================
-- MÉTRICAS DE FUNIL - Views para Conversão por Estágio
-- =====================================================

-- 1. View: Contagem por estágio atual (snapshot)
CREATE OR REPLACE VIEW v_funnel_stage_counts AS
SELECT 
  COALESCE(bitrix24_stage, 'SEM_STAGE') as stage_id,
  COUNT(*) as total_leads,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as leads_7d,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as leads_30d,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as leads_hoje
FROM chatbot_conversas
WHERE bitrix24_lead_id IS NOT NULL
GROUP BY bitrix24_stage
ORDER BY total_leads DESC;

-- 2. View: Taxa de conversão entre estágios
CREATE OR REPLACE VIEW v_funnel_conversion_rates AS
WITH stage_transitions AS (
  SELECT 
    COUNT(*) FILTER (WHERE bitrix24_lead_id IS NOT NULL) as total_leads,
    COUNT(*) FILTER (WHERE proposta_link_sent_at IS NOT NULL) as com_proposta_inicial,
    COUNT(*) FILTER (WHERE proposta_id IS NOT NULL) as com_proposta,
    COUNT(*) FILTER (WHERE all_docs_complete_at IS NOT NULL) as docs_completos,
    COUNT(*) FILTER (WHERE contrato_enviado_at IS NOT NULL) as contrato_enviado,
    COUNT(*) FILTER (WHERE contrato_assinado = true) as contrato_assinado
  FROM chatbot_conversas
  WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT 
  total_leads,
  com_proposta_inicial,
  com_proposta,
  docs_completos,
  contrato_enviado,
  contrato_assinado,
  -- Taxas de conversão
  CASE WHEN total_leads > 0 
    THEN ROUND((com_proposta_inicial::numeric / total_leads) * 100, 2) 
    ELSE 0 END as taxa_lead_to_proposta,
  CASE WHEN com_proposta_inicial > 0 
    THEN ROUND((docs_completos::numeric / com_proposta_inicial) * 100, 2) 
    ELSE 0 END as taxa_proposta_to_docs,
  CASE WHEN docs_completos > 0 
    THEN ROUND((contrato_enviado::numeric / docs_completos) * 100, 2) 
    ELSE 0 END as taxa_docs_to_contrato,
  CASE WHEN contrato_enviado > 0 
    THEN ROUND((contrato_assinado::numeric / contrato_enviado) * 100, 2) 
    ELSE 0 END as taxa_contrato_to_assinado,
  -- Taxa total
  CASE WHEN total_leads > 0 
    THEN ROUND((contrato_assinado::numeric / total_leads) * 100, 2) 
    ELSE 0 END as taxa_conversao_total
FROM stage_transitions;

-- 3. View: Tempo médio em cada estágio
CREATE OR REPLACE VIEW v_funnel_stage_duration AS
SELECT 
  -- Lead → Proposta Inicial
  AVG(EXTRACT(EPOCH FROM (proposta_link_sent_at - created_at)) / 3600) 
    FILTER (WHERE proposta_link_sent_at IS NOT NULL) as avg_hours_to_proposta,
  
  -- Proposta Inicial → Docs Completos
  AVG(EXTRACT(EPOCH FROM (all_docs_complete_at - proposta_link_sent_at)) / 3600) 
    FILTER (WHERE all_docs_complete_at IS NOT NULL AND proposta_link_sent_at IS NOT NULL) as avg_hours_proposta_to_docs,
  
  -- Docs Completos → Contrato Enviado
  AVG(EXTRACT(EPOCH FROM (contrato_enviado_at - all_docs_complete_at)) / 3600) 
    FILTER (WHERE contrato_enviado_at IS NOT NULL AND all_docs_complete_at IS NOT NULL) as avg_hours_docs_to_contrato,
  
  -- Contrato Enviado → Assinado
  AVG(EXTRACT(EPOCH FROM (contrato_assinado_at - contrato_enviado_at)) / 3600) 
    FILTER (WHERE contrato_assinado_at IS NOT NULL AND contrato_enviado_at IS NOT NULL) as avg_hours_to_assinatura,
  
  -- Tempo total: Lead → Assinatura
  AVG(EXTRACT(EPOCH FROM (contrato_assinado_at - created_at)) / 86400) 
    FILTER (WHERE contrato_assinado_at IS NOT NULL) as avg_days_total_conversion

FROM chatbot_conversas
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days';

-- 4. View: Funil diário (últimos 30 dias)
CREATE OR REPLACE VIEW v_funnel_daily AS
SELECT 
  DATE(created_at) as data,
  COUNT(*) as novos_leads,
  COUNT(*) FILTER (WHERE proposta_link_sent_at IS NOT NULL 
    AND DATE(proposta_link_sent_at) = DATE(created_at)) as propostas_mesmo_dia,
  COUNT(*) FILTER (WHERE contrato_assinado = true 
    AND DATE(contrato_assinado_at) = DATE(created_at)) as assinaturas_mesmo_dia,
  COUNT(*) FILTER (WHERE ended_at IS NOT NULL 
    AND contrato_assinado IS NOT true) as leads_perdidos
FROM chatbot_conversas
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND bitrix24_lead_id IS NOT NULL
GROUP BY DATE(created_at)
ORDER BY data DESC;

-- 5. View: Drop-off analysis (onde leads param)
CREATE OR REPLACE VIEW v_funnel_dropoff AS
SELECT 
  CASE 
    WHEN contrato_assinado = true THEN 'CONVERTIDO'
    WHEN contrato_enviado_at IS NOT NULL THEN 'AGUARDANDO_ASSINATURA'
    WHEN all_docs_complete_at IS NOT NULL THEN 'DOCS_OK_SEM_CONTRATO'
    WHEN proposta_id IS NOT NULL THEN 'PROPOSTA_SEM_DOCS'
    WHEN proposta_link_sent_at IS NOT NULL THEN 'LINK_ENVIADO_SEM_PROPOSTA'
    WHEN bitrix24_lead_id IS NOT NULL THEN 'LEAD_SEM_PROPOSTA'
    ELSE 'SEM_LEAD'
  END as dropoff_stage,
  COUNT(*) as quantidade,
  ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100, 2) as percentual,
  AVG(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - created_at)) / 86400) as avg_dias_no_stage
FROM chatbot_conversas
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY 1
ORDER BY quantidade DESC;

-- 6. View: Conversão por fonte de lead
CREATE OR REPLACE VIEW v_funnel_by_source AS
SELECT 
  COALESCE(lead_source, 'desconhecido') as fonte,
  COUNT(*) as total_leads,
  COUNT(*) FILTER (WHERE proposta_link_sent_at IS NOT NULL) as com_proposta,
  COUNT(*) FILTER (WHERE contrato_assinado = true) as convertidos,
  CASE WHEN COUNT(*) > 0 
    THEN ROUND((COUNT(*) FILTER (WHERE contrato_assinado = true)::numeric / COUNT(*)) * 100, 2) 
    ELSE 0 END as taxa_conversao
FROM chatbot_conversas
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND bitrix24_lead_id IS NOT NULL
GROUP BY lead_source
ORDER BY total_leads DESC;

-- 7. View: Performance semanal comparativa
CREATE OR REPLACE VIEW v_funnel_weekly_comparison AS
WITH weekly_data AS (
  SELECT 
    DATE_TRUNC('week', created_at)::date as semana,
    COUNT(*) as leads,
    COUNT(*) FILTER (WHERE proposta_link_sent_at IS NOT NULL) as propostas,
    COUNT(*) FILTER (WHERE contrato_assinado = true) as conversoes
  FROM chatbot_conversas
  WHERE created_at >= CURRENT_DATE - INTERVAL '8 weeks'
    AND bitrix24_lead_id IS NOT NULL
  GROUP BY DATE_TRUNC('week', created_at)
)
SELECT 
  semana,
  leads,
  propostas,
  conversoes,
  CASE WHEN leads > 0 
    THEN ROUND((conversoes::numeric / leads) * 100, 2) 
    ELSE 0 END as taxa_conversao,
  leads - LAG(leads) OVER (ORDER BY semana) as variacao_leads,
  conversoes - LAG(conversoes) OVER (ORDER BY semana) as variacao_conversoes
FROM weekly_data
ORDER BY semana DESC;