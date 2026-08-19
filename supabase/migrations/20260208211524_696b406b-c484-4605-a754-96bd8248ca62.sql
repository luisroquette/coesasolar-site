
DROP FUNCTION IF EXISTS public.add_to_message_buffer(text,text,text,text,timestamp with time zone);

CREATE OR REPLACE FUNCTION public.add_to_message_buffer(
  p_phone TEXT,
  p_agent_id TEXT,
  p_message_text TEXT,
  p_message_id TEXT,
  p_timestamp TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  buffer_id UUID,
  message_count INTEGER,
  session_started_at TIMESTAMPTZ,
  is_new_session BOOLEAN
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_buffer_id UUID;
  v_session_started TIMESTAMPTZ;
  v_is_new BOOLEAN := false;
  v_message_count INTEGER;
  v_last_message_at TIMESTAMPTZ;
  v_session_timeout_ms INTEGER := 5000;
BEGIN
  SELECT mb.id, mb.last_message_at, mb.session_started_at
  INTO v_buffer_id, v_last_message_at, v_session_started
  FROM message_buffers mb
  WHERE mb.phone = p_phone AND mb.agent_id = p_agent_id
  FOR UPDATE;
  
  IF v_buffer_id IS NULL THEN
    INSERT INTO message_buffers (phone, agent_id, messages, last_message_at, session_started_at)
    VALUES (
      p_phone, p_agent_id, 
      jsonb_build_array(jsonb_build_object(
        'text', p_message_text,
        'message_id', p_message_id,
        'timestamp', extract(epoch from p_timestamp) * 1000
      )),
      p_timestamp, p_timestamp
    )
    RETURNING message_buffers.id, message_buffers.session_started_at 
    INTO v_buffer_id, v_session_started;
    
    v_is_new := true;
    v_message_count := 1;
  ELSE
    IF extract(epoch from (p_timestamp - v_last_message_at)) * 1000 > v_session_timeout_ms THEN
      UPDATE message_buffers SET 
        messages = jsonb_build_array(jsonb_build_object(
          'text', p_message_text,
          'message_id', p_message_id,
          'timestamp', extract(epoch from p_timestamp) * 1000
        )),
        last_message_at = p_timestamp,
        session_started_at = p_timestamp,
        is_processing = false
      WHERE message_buffers.id = v_buffer_id;
      
      v_session_started := p_timestamp;
      v_is_new := true;
      v_message_count := 1;
    ELSE
      UPDATE message_buffers SET 
        messages = messages || jsonb_build_array(jsonb_build_object(
          'text', p_message_text,
          'message_id', p_message_id,
          'timestamp', extract(epoch from p_timestamp) * 1000
        )),
        last_message_at = p_timestamp
      WHERE message_buffers.id = v_buffer_id;
      
      SELECT jsonb_array_length(mb.messages) INTO v_message_count
      FROM message_buffers mb WHERE mb.id = v_buffer_id;
    END IF;
  END IF;
  
  RETURN QUERY SELECT v_buffer_id AS buffer_id, v_message_count AS message_count, 
    v_session_started AS session_started_at, v_is_new AS is_new_session;
END;
$$;
