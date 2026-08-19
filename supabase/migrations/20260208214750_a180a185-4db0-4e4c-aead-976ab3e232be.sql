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
  v_count INTEGER := 0;
BEGIN
  DELETE FROM message_processing_locks 
  WHERE phone_normalized = p_phone 
    AND locked_by = p_instance_id;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;