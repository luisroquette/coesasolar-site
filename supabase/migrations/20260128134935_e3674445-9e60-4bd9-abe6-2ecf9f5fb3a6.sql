-- ═══════════════════════════════════════════════════════════════
-- Cross-Webhook Distributed Lock
-- Prevents simultaneous processing by sofia-webhook and bitrix24-link-webhook
-- ═══════════════════════════════════════════════════════════════

-- Create table for cross-webhook locks (if not exists from previous attempt)
CREATE TABLE IF NOT EXISTS public.cross_webhook_locks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_normalized TEXT NOT NULL,
  lead_id TEXT,
  locked_by TEXT NOT NULL,
  lock_purpose TEXT,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Simple unique constraint on phone (cleanup handles expiration)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cross_webhook_locks_phone_unique 
ON public.cross_webhook_locks(phone_normalized);

-- Index for cleanup by expiration
CREATE INDEX IF NOT EXISTS idx_cross_webhook_locks_expires 
ON public.cross_webhook_locks(expires_at);

-- Enable RLS
ALTER TABLE public.cross_webhook_locks ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists then recreate
DROP POLICY IF EXISTS "Service role full access" ON public.cross_webhook_locks;
CREATE POLICY "Service role full access" ON public.cross_webhook_locks
FOR ALL USING (true) WITH CHECK (true);

-- RPC to acquire cross-webhook lock
CREATE OR REPLACE FUNCTION public.acquire_cross_webhook_lock(
  p_phone TEXT,
  p_lead_id TEXT,
  p_locked_by TEXT,
  p_purpose TEXT DEFAULT 'processing',
  p_lock_duration_seconds INTEGER DEFAULT 30
)
RETURNS TABLE(
  acquired BOOLEAN,
  existing_lock_by TEXT,
  existing_lock_purpose TEXT,
  lock_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_lock RECORD;
  v_new_lock_id UUID;
BEGIN
  -- Clean up expired locks first
  DELETE FROM cross_webhook_locks 
  WHERE expires_at < now();
  
  -- Check for existing active lock
  SELECT cwl.id, cwl.locked_by, cwl.lock_purpose
  INTO v_existing_lock
  FROM cross_webhook_locks cwl
  WHERE cwl.phone_normalized = p_phone
    AND cwl.expires_at > now()
  LIMIT 1;
  
  -- If lock exists and held by different webhook, return failure
  IF v_existing_lock.id IS NOT NULL THEN
    RETURN QUERY SELECT 
      FALSE as acquired,
      v_existing_lock.locked_by as existing_lock_by,
      v_existing_lock.lock_purpose as existing_lock_purpose,
      v_existing_lock.id as lock_id;
    RETURN;
  END IF;
  
  -- Try to acquire lock (upsert to handle race)
  INSERT INTO cross_webhook_locks (
    phone_normalized,
    lead_id,
    locked_by,
    lock_purpose,
    locked_at,
    expires_at
  )
  VALUES (
    p_phone,
    p_lead_id,
    p_locked_by,
    p_purpose,
    now(),
    now() + (p_lock_duration_seconds || ' seconds')::INTERVAL
  )
  ON CONFLICT (phone_normalized) DO UPDATE
  SET 
    lead_id = EXCLUDED.lead_id,
    locked_by = EXCLUDED.locked_by,
    lock_purpose = EXCLUDED.lock_purpose,
    locked_at = EXCLUDED.locked_at,
    expires_at = EXCLUDED.expires_at
  WHERE cross_webhook_locks.expires_at < now()  -- Only update if existing is expired
  RETURNING id INTO v_new_lock_id;
  
  -- Check if we got the lock
  IF v_new_lock_id IS NOT NULL THEN
    RETURN QUERY SELECT 
      TRUE as acquired,
      NULL::TEXT as existing_lock_by,
      NULL::TEXT as existing_lock_purpose,
      v_new_lock_id as lock_id;
  ELSE
    -- Someone else has it
    SELECT cwl.id, cwl.locked_by, cwl.lock_purpose
    INTO v_existing_lock
    FROM cross_webhook_locks cwl
    WHERE cwl.phone_normalized = p_phone
    LIMIT 1;
    
    RETURN QUERY SELECT 
      FALSE as acquired,
      v_existing_lock.locked_by as existing_lock_by,
      v_existing_lock.lock_purpose as existing_lock_purpose,
      v_existing_lock.id as lock_id;
  END IF;
END;
$$;

-- RPC to release cross-webhook lock
CREATE OR REPLACE FUNCTION public.release_cross_webhook_lock(
  p_phone TEXT,
  p_locked_by TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_released INTEGER;
BEGIN
  DELETE FROM cross_webhook_locks 
  WHERE phone_normalized = p_phone 
    AND locked_by = p_locked_by;
  
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released > 0;
END;
$$;

-- RPC to extend lock
CREATE OR REPLACE FUNCTION public.extend_cross_webhook_lock(
  p_phone TEXT,
  p_locked_by TEXT,
  p_additional_seconds INTEGER DEFAULT 30
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_extended INTEGER;
BEGIN
  UPDATE cross_webhook_locks 
  SET expires_at = now() + (p_additional_seconds || ' seconds')::INTERVAL
  WHERE phone_normalized = p_phone 
    AND locked_by = p_locked_by
    AND expires_at > now();
  
  GET DIAGNOSTICS v_extended = ROW_COUNT;
  RETURN v_extended > 0;
END;
$$;