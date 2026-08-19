-- ============================================================
-- CIRCUIT BREAKER STATE TABLE
-- Stores circuit breaker state for resilience patterns
-- ============================================================

CREATE TABLE IF NOT EXISTS public.circuit_breaker_state (
  circuit_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half_open')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for monitoring queries
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_state_updated 
ON public.circuit_breaker_state(updated_at DESC);

-- Enable RLS
ALTER TABLE public.circuit_breaker_state ENABLE ROW LEVEL SECURITY;

-- RLS: Only allow service_role to access (internal infrastructure table)
CREATE POLICY "circuit_breaker_service_role_all"
ON public.circuit_breaker_state
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.circuit_breaker_state IS 'Circuit breaker state for resilience patterns - manages service health states';

-- ============================================================
-- LOG CLEANUP POLICY
-- Add scheduled cleanup for old log entries
-- ============================================================

-- Create cleanup function for log tables
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  total_deleted INTEGER := 0;
  deleted_count INTEGER;
BEGIN
  -- Cleanup whatsapp_webhook_events older than 30 days
  DELETE FROM whatsapp_webhook_events
  WHERE created_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  total_deleted := total_deleted + deleted_count;

  -- Cleanup bitrix24_sync_logs older than 30 days
  DELETE FROM bitrix24_sync_logs
  WHERE created_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  total_deleted := total_deleted + deleted_count;

  -- Cleanup activity_logs older than 90 days
  DELETE FROM activity_logs
  WHERE created_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  total_deleted := total_deleted + deleted_count;

  -- Cleanup infra_metrics older than 7 days
  DELETE FROM infra_metrics
  WHERE created_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  total_deleted := total_deleted + deleted_count;

  -- Cleanup rate_limit_violations older than 14 days
  DELETE FROM rate_limit_violations
  WHERE created_at < now() - INTERVAL '14 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  total_deleted := total_deleted + deleted_count;

  -- Log the cleanup
  RAISE NOTICE 'Log cleanup completed: % total records deleted', total_deleted;
  
  RETURN total_deleted;
END;
$$;