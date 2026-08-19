-- ================================================================
-- FIX: Resolve ambiguous column reference 'session_started_at' 
-- in add_to_message_buffer function
-- ================================================================

CREATE OR REPLACE FUNCTION public.add_to_message_buffer(
  p_phone TEXT,
  p_message_id TEXT,
  p_message_text TEXT,
  p_agent_id TEXT DEFAULT 'sofia',
  p_session_timeout_minutes INT DEFAULT 3
)
RETURNS TABLE(
  buffer_id UUID,
  message_count INT,
  session_started_at TIMESTAMPTZ,
  is_new_session BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buffer_id UUID;
  v_message_count INT;
  v_session_started TIMESTAMPTZ;
  v_is_new BOOLEAN := FALSE;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Find existing active session (within timeout window)
  SELECT 
    mb.id, 
    mb.message_count, 
    mb.session_started_at
  INTO 
    v_buffer_id, 
    v_message_count, 
    v_session_started
  FROM message_buffer mb
  WHERE mb.phone_normalized = p_phone
    AND mb.agent_id = p_agent_id
    AND mb.is_processed = FALSE
    AND mb.last_message_at > v_now - (p_session_timeout_minutes || ' minutes')::INTERVAL
  ORDER BY mb.last_message_at DESC
  LIMIT 1;
  
  IF v_buffer_id IS NULL THEN
    -- Create new buffer session
    INSERT INTO message_buffer (
      phone_normalized,
      agent_id,
      messages,
      message_ids,
      message_count,
      session_started_at,
      last_message_at
    ) VALUES (
      p_phone,
      p_agent_id,
      ARRAY[p_message_text],
      ARRAY[p_message_id],
      1,
      v_now,
      v_now
    )
    RETURNING id, 1, message_buffer.session_started_at
    INTO v_buffer_id, v_message_count, v_session_started;
    
    v_is_new := TRUE;
  ELSE
    -- Append to existing buffer
    UPDATE message_buffer
    SET 
      messages = messages || p_message_text,
      message_ids = message_ids || p_message_id,
      message_count = message_count + 1,
      last_message_at = v_now
    WHERE id = v_buffer_id
    RETURNING message_count INTO v_message_count;
  END IF;
  
  -- Return with explicit aliases to avoid ambiguity
  RETURN QUERY SELECT 
    v_buffer_id AS buffer_id, 
    v_message_count AS message_count, 
    v_session_started AS session_started_at, 
    v_is_new AS is_new_session;
END;
$$;