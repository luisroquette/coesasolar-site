-- Repair orphaned conversations where greeting was sent but state wasn't properly set
-- This fixes conversations created before the greeting-phase fix was deployed

UPDATE chatbot_conversas c
SET dados_coletados = COALESCE(dados_coletados, '{}'::jsonb) || jsonb_build_object(
  'greeting_sent', true,
  'awaiting_clausula_petrea_response', true,
  'state_repaired_at', NOW()::text,
  'state_repair_reason', 'migration_orphaned_greeting_repair'
)
WHERE c.agent_id = 'sofia'
AND c.created_at > NOW() - INTERVAL '7 days'
AND c.sofia_mode IS DISTINCT FROM 'paused_for_human'
AND c.sofia_mode IS DISTINCT FROM 'manual'
AND (c.dados_coletados->>'greeting_sent' IS NULL OR c.dados_coletados->>'greeting_sent' = 'false')
AND (c.dados_coletados->>'awaiting_clausula_petrea_response' IS NULL OR c.dados_coletados->>'awaiting_clausula_petrea_response' = 'false')
AND (c.dados_coletados->>'triagem_concluida' IS NULL OR c.dados_coletados->>'triagem_concluida' = 'false')
AND EXISTS (
  SELECT 1 FROM chatbot_mensagens m 
  WHERE m.conversa_id = c.id 
  AND m.role = 'assistant'
  AND (
    m.content ILIKE '%energia por assinatura%'
    OR m.content ILIKE '%Você já conhece%'
  )
);