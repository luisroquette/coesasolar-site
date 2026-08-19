-- ═══════════════════════════════════════════════════════════════
-- MESSAGE PROCESSING LOCKS - DISTRIBUTED LOCK FOR PHONE NUMBERS
-- Prevents race conditions when multiple webhook calls process same phone
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.message_processing_locks (
  phone_normalized TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 seconds')
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_message_locks_expires 
ON public.message_processing_locks(expires_at);

-- Enable RLS
ALTER TABLE public.message_processing_locks ENABLE ROW LEVEL SECURITY;

-- Policy for service role only (edge functions)
CREATE POLICY "Service role can manage locks"
ON public.message_processing_locks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- ACQUIRE PHONE LOCK - Atomic function to claim processing rights
-- Returns TRUE if lock acquired, FALSE if another instance has it
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.acquire_phone_lock(
  p_phone TEXT,
  p_agent_id TEXT,
  p_instance_id TEXT,
  p_lock_duration_seconds INTEGER DEFAULT 30
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acquired BOOLEAN := FALSE;
BEGIN
  -- Clean up expired locks first
  DELETE FROM message_processing_locks 
  WHERE expires_at < now();
  
  -- Try to insert new lock (will fail silently if exists)
  INSERT INTO message_processing_locks (
    phone_normalized, 
    agent_id,
    locked_by, 
    locked_at,
    expires_at
  )
  VALUES (
    p_phone, 
    p_agent_id,
    p_instance_id, 
    now(),
    now() + (p_lock_duration_seconds || ' seconds')::INTERVAL
  )
  ON CONFLICT (phone_normalized) DO NOTHING;
  
  -- Check if WE got the lock
  SELECT EXISTS (
    SELECT 1 FROM message_processing_locks 
    WHERE phone_normalized = p_phone 
      AND locked_by = p_instance_id
  ) INTO v_acquired;
  
  RETURN v_acquired;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RELEASE PHONE LOCK - Explicitly release when done processing
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.release_phone_lock(
  p_phone TEXT,
  p_instance_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released BOOLEAN := FALSE;
BEGIN
  DELETE FROM message_processing_locks 
  WHERE phone_normalized = p_phone 
    AND locked_by = p_instance_id;
  
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released > 0;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- EXTEND PHONE LOCK - Extend lock if processing takes longer
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.extend_phone_lock(
  p_phone TEXT,
  p_instance_id TEXT,
  p_additional_seconds INTEGER DEFAULT 30
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_extended BOOLEAN := FALSE;
BEGIN
  UPDATE message_processing_locks 
  SET expires_at = now() + (p_additional_seconds || ' seconds')::INTERVAL
  WHERE phone_normalized = p_phone 
    AND locked_by = p_instance_id;
  
  GET DIAGNOSTICS v_extended = ROW_COUNT;
  RETURN v_extended > 0;
END;
$$;

-- Grant execute to service_role
GRANT EXECUTE ON FUNCTION public.acquire_phone_lock TO service_role;
GRANT EXECUTE ON FUNCTION public.release_phone_lock TO service_role;
GRANT EXECUTE ON FUNCTION public.extend_phone_lock TO service_role;