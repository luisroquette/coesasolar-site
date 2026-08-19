-- Função atômica para claim de conversa (resolve race condition de mensagens duplicadas)
-- Faz UPDATE + RETURNING numa única operação, retornando valores ANTERIORES ao update
CREATE OR REPLACE FUNCTION public.claim_conversation_for_processing(
  p_conversa_id UUID,
  p_new_timestamp TIMESTAMPTZ
)
RETURNS TABLE(
  previous_last_message_at TIMESTAMPTZ,
  previous_last_sofia_message_at TIMESTAMPTZ,
  conversation_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_last_message_at TIMESTAMPTZ;
  v_old_last_sofia_message_at TIMESTAMPTZ;
  v_created_at TIMESTAMPTZ;
BEGIN
  -- Primeiro, captura os valores atuais
  SELECT 
    cc.last_message_at,
    cc.last_sofia_message_at,
    cc.created_at
  INTO 
    v_old_last_message_at,
    v_old_last_sofia_message_at,
    v_created_at
  FROM chatbot_conversas cc
  WHERE cc.id = p_conversa_id
  FOR UPDATE; -- Lock para garantir atomicidade
  
  -- Atualiza com o novo timestamp
  UPDATE chatbot_conversas
  SET last_message_at = p_new_timestamp
  WHERE id = p_conversa_id;
  
  -- Retorna os valores ANTERIORES
  RETURN QUERY SELECT 
    v_old_last_message_at,
    v_old_last_sofia_message_at,
    v_created_at;
END;
$$;