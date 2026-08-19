CREATE OR REPLACE FUNCTION public.claim_message_buffer(
  p_phone TEXT,
  p_agent_id TEXT
)
RETURNS TABLE(claimed BOOLEAN, buffer_id UUID, messages JSONB, message_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buffer_id UUID;
  v_messages JSONB;
BEGIN
  -- Try to claim (atomically)
  UPDATE message_buffers mb
  SET is_processing = true
  WHERE mb.phone = p_phone 
    AND mb.agent_id = p_agent_id 
    AND mb.is_processing = false
  RETURNING mb.id, mb.messages INTO v_buffer_id, v_messages;
  
  IF v_buffer_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::JSONB, 0;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT true, v_buffer_id, v_messages, jsonb_array_length(COALESCE(v_messages, '[]'::jsonb))::INT;
END;
$$;