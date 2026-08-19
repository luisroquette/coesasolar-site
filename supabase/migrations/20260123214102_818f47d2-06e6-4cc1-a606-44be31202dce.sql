-- ═══════════════════════════════════════════════════════════════
-- Limpar conversas que foram desqualificadas por TARIFA SOCIAL
-- mas não tiveram o banco atualizado corretamente
-- ═══════════════════════════════════════════════════════════════

WITH tarifa_social_rejections AS (
  SELECT DISTINCT cc.id, cm.created_at as rejection_time
  FROM chatbot_conversas cc
  JOIN chatbot_mensagens cm ON cm.conversa_id = cc.id
  WHERE cc.sofia_mode IN ('standard', 'contract_closer', 'lead_frio')
    AND cc.ended_at IS NULL
    AND cm.role = 'assistant'
    AND (
      -- Mensagens de rejeição por Tarifa Social
      cm.content ILIKE '%tarifa social%' AND (
        cm.content ILIKE '%não consigo%' OR
        cm.content ILIKE '%não foi aprovad%' OR
        cm.content ILIKE '%impede%' OR
        cm.content ILIKE '%que pena%' OR
        cm.content ILIKE '%infelizmente%' OR
        cm.content ILIKE '%não se aplica%'
      )
    )
    -- Não houve mensagem do cliente depois da rejeição indicando interesse renovado
    AND NOT EXISTS (
      SELECT 1 FROM chatbot_mensagens cm2
      WHERE cm2.conversa_id = cc.id
        AND cm2.role = 'user'
        AND cm2.created_at > cm.created_at
        AND (
          cm2.content ILIKE '%quero%' OR
          cm2.content ILIKE '%tenho interesse%' OR
          cm2.content ILIKE '%posso%'
        )
    )
)
UPDATE chatbot_conversas
SET 
  sofia_mode = 'descartado',
  ended_at = COALESCE(ended_at, NOW()),
  awaiting_response = false,
  next_nudge_at = NULL,
  next_followup_at = NULL,
  dados_coletados = COALESCE(dados_coletados, '{}'::jsonb) || 
    '{"motivoDescarte": "tarifa_social", "descarteRetroativoCleanup": true}'::jsonb
WHERE id IN (SELECT id FROM tarifa_social_rejections);