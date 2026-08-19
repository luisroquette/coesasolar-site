-- ═══════════════════════════════════════════════════════════════
-- Limpar conversas que foram desqualificadas por mensagem
-- mas não tiveram o banco atualizado corretamente
-- ═══════════════════════════════════════════════════════════════

WITH rejected_conversations AS (
  SELECT DISTINCT cc.id, cm.created_at as rejection_time
  FROM chatbot_conversas cc
  JOIN chatbot_mensagens cm ON cm.conversa_id = cc.id
  WHERE cc.sofia_mode = 'standard'
    AND cc.ended_at IS NULL
    AND cm.role = 'assistant'
    AND (
      cm.content ILIKE '%não atendemos%região%' OR
      cm.content ILIKE '%não atendemos%distribuidora%' OR
      cm.content ILIKE '%sentimos muito%região%' OR
      cm.content ILIKE '%sentimos muito%expansão%' OR
      cm.content ILIKE '%ainda não chegamos%região%' OR
      cm.content ILIKE '%infelizmente%não operamos%'
    )
    -- Não houve mensagem do cliente depois da rejeição
    AND NOT EXISTS (
      SELECT 1 FROM chatbot_mensagens cm2
      WHERE cm2.conversa_id = cc.id
        AND cm2.role = 'user'
        AND cm2.created_at > cm.created_at
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
    '{"motivoDescarte": "distribuidora_nao_atendida", "descarteRetroativoCleanup": true}'::jsonb
WHERE id IN (SELECT id FROM rejected_conversations);