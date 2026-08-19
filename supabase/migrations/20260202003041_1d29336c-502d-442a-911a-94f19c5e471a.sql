-- ═══════════════════════════════════════════════════════════════
-- MESSAGE BUFFERS TABLE FOR HUMANIZED RESPONSE SYSTEM
-- Accumulates messages per phone during silence window
-- ═══════════════════════════════════════════════════════════════

-- Create table to store buffered messages
CREATE TABLE IF NOT EXISTS public.message_buffers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  agent_id VARCHAR(50) NOT NULL DEFAULT 'sofia',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_processing BOOLEAN NOT NULL DEFAULT false,
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint on phone + agent (one buffer per phone per agent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_buffers_phone_agent 
  ON public.message_buffers(phone, agent_id);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_message_buffers_last_message 
  ON public.message_buffers(last_message_at);

-- Index for processing flag
CREATE INDEX IF NOT EXISTS idx_message_buffers_processing 
  ON public.message_buffers(is_processing) WHERE is_processing = true;

-- Enable RLS
ALTER TABLE public.message_buffers ENABLE ROW LEVEL SECURITY;

-- Policy for service role only (edge functions)
CREATE POLICY "service_role_full_access" ON public.message_buffers
  FOR ALL 
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_message_buffers_updated_at
  BEFORE UPDATE ON public.message_buffers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- BUFFER MANAGEMENT FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

-- Add message to buffer (upsert)
CREATE OR REPLACE FUNCTION public.add_to_message_buffer(
  p_phone TEXT,
  p_agent_id TEXT,
  p_message_text TEXT,
  p_message_id TEXT DEFAULT NULL,
  p_timestamp TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE(
  buffer_id UUID,
  message_count INTEGER,
  session_started_at TIMESTAMPTZ,
  is_new_session BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_buffer_id UUID;
  v_session_started TIMESTAMPTZ;
  v_is_new BOOLEAN := false;
  v_message_count INTEGER;
  v_last_message_at TIMESTAMPTZ;
  v_session_timeout_ms INTEGER := 5000; -- 5 seconds for new session
BEGIN
  -- Check if buffer exists for this phone
  SELECT mb.id, mb.last_message_at, mb.session_started_at
  INTO v_buffer_id, v_last_message_at, v_session_started
  FROM message_buffers mb
  WHERE mb.phone = p_phone AND mb.agent_id = p_agent_id
  FOR UPDATE;
  
  IF v_buffer_id IS NULL THEN
    -- Create new buffer
    INSERT INTO message_buffers (phone, agent_id, messages, last_message_at, session_started_at)
    VALUES (
      p_phone, 
      p_agent_id, 
      jsonb_build_array(jsonb_build_object(
        'text', p_message_text,
        'message_id', p_message_id,
        'timestamp', extract(epoch from p_timestamp) * 1000
      )),
      p_timestamp,
      p_timestamp
    )
    RETURNING id, session_started_at INTO v_buffer_id, v_session_started;
    
    v_is_new := true;
    v_message_count := 1;
  ELSE
    -- Check if this is a new session (gap > 5 seconds)
    IF extract(epoch from (p_timestamp - v_last_message_at)) * 1000 > v_session_timeout_ms THEN
      -- Reset buffer for new session
      UPDATE message_buffers
      SET 
        messages = jsonb_build_array(jsonb_build_object(
          'text', p_message_text,
          'message_id', p_message_id,
          'timestamp', extract(epoch from p_timestamp) * 1000
        )),
        last_message_at = p_timestamp,
        session_started_at = p_timestamp,
        is_processing = false
      WHERE id = v_buffer_id;
      
      v_session_started := p_timestamp;
      v_is_new := true;
      v_message_count := 1;
    ELSE
      -- Append to existing buffer
      UPDATE message_buffers
      SET 
        messages = messages || jsonb_build_array(jsonb_build_object(
          'text', p_message_text,
          'message_id', p_message_id,
          'timestamp', extract(epoch from p_timestamp) * 1000
        )),
        last_message_at = p_timestamp
      WHERE id = v_buffer_id;
      
      -- Get updated count
      SELECT jsonb_array_length(messages) INTO v_message_count
      FROM message_buffers WHERE id = v_buffer_id;
    END IF;
  END IF;
  
  RETURN QUERY SELECT v_buffer_id, v_message_count, v_session_started, v_is_new;
END;
$$;

-- Get buffer and check if ready to process (silence period reached)
CREATE OR REPLACE FUNCTION public.check_buffer_ready(
  p_phone TEXT,
  p_agent_id TEXT,
  p_silence_window_ms INTEGER DEFAULT 4000
)
RETURNS TABLE(
  is_ready BOOLEAN,
  buffer_id UUID,
  messages JSONB,
  message_count INTEGER,
  ms_since_last_message BIGINT,
  session_started_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_buffer RECORD;
  v_ms_elapsed BIGINT;
BEGIN
  SELECT mb.id, mb.messages, mb.last_message_at, mb.session_started_at, mb.is_processing
  INTO v_buffer
  FROM message_buffers mb
  WHERE mb.phone = p_phone AND mb.agent_id = p_agent_id;
  
  IF v_buffer.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::JSONB, 0, 0::BIGINT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  
  -- Already being processed
  IF v_buffer.is_processing THEN
    RETURN QUERY SELECT false, v_buffer.id, v_buffer.messages, 
      jsonb_array_length(v_buffer.messages), 0::BIGINT, v_buffer.session_started_at;
    RETURN;
  END IF;
  
  -- Calculate time since last message
  v_ms_elapsed := extract(epoch from (now() - v_buffer.last_message_at)) * 1000;
  
  RETURN QUERY SELECT 
    (v_ms_elapsed >= p_silence_window_ms) as is_ready,
    v_buffer.id,
    v_buffer.messages,
    jsonb_array_length(v_buffer.messages),
    v_ms_elapsed,
    v_buffer.session_started_at;
END;
$$;

-- Claim buffer for processing (atomically set is_processing = true)
CREATE OR REPLACE FUNCTION public.claim_message_buffer(
  p_phone TEXT,
  p_agent_id TEXT
)
RETURNS TABLE(
  claimed BOOLEAN,
  buffer_id UUID,
  messages JSONB,
  message_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_buffer_id UUID;
  v_messages JSONB;
BEGIN
  -- Try to claim (atomically)
  UPDATE message_buffers
  SET is_processing = true
  WHERE phone = p_phone 
    AND agent_id = p_agent_id 
    AND is_processing = false
  RETURNING id, messages INTO v_buffer_id, v_messages;
  
  IF v_buffer_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::JSONB, 0;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT true, v_buffer_id, v_messages, jsonb_array_length(v_messages);
END;
$$;

-- Clear buffer after processing
CREATE OR REPLACE FUNCTION public.clear_message_buffer(
  p_phone TEXT,
  p_agent_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM message_buffers
  WHERE phone = p_phone AND agent_id = p_agent_id;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

-- Cleanup old buffers (called periodically)
CREATE OR REPLACE FUNCTION public.cleanup_stale_message_buffers()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Delete buffers older than 5 minutes (300000 ms)
  DELETE FROM message_buffers
  WHERE last_message_at < now() - INTERVAL '5 minutes';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  -- Also reset stuck processing flags (older than 2 minutes)
  UPDATE message_buffers
  SET is_processing = false
  WHERE is_processing = true
    AND updated_at < now() - INTERVAL '2 minutes';
  
  RETURN v_deleted;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- NEW CONFIGURATIONS FOR BUFFER SYSTEM
-- ═══════════════════════════════════════════════════════════════

INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('buffer_wait_window_ms', '4000', 'Janela de espera por silêncio antes de processar buffer (ms)'),
  ('buffer_session_timeout_ms', '5000', 'Timeout para considerar nova sessão de buffer (ms)'),
  ('buffer_max_messages', '10', 'Máximo de mensagens acumuladas no buffer'),
  ('buffer_phantom_enter_chars', '10', 'Limite de caracteres para detectar Enter Fantasma'),
  ('latency_short_msg_seconds', '2.0', 'Latência para mensagens curtas (<100 chars)'),
  ('latency_medium_msg_seconds', '1.5', 'Latência para mensagens médias (100-300 chars)'),
  ('latency_long_msg_seconds', '1.0', 'Latência para mensagens longas (>300 chars)'),
  ('latency_random_variation', '0.3', 'Variação aleatória na latência (±segundos)'),
  ('typing_indicator_enabled', 'true', 'Habilitar indicador de digitando antes de responder')
ON CONFLICT (chave) DO UPDATE SET 
  valor = EXCLUDED.valor,
  descricao = EXCLUDED.descricao,
  updated_at = now();