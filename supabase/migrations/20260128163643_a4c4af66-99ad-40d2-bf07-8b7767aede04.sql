-- ==========================================
-- FIX: claim_rag_sync_batch returning multiple rows error
-- FEATURE: Parallel processing support
-- ==========================================

-- Drop and recreate with proper implementation
DROP FUNCTION IF EXISTS public.claim_rag_sync_batch(integer);

CREATE OR REPLACE FUNCTION public.claim_rag_sync_batch(p_batch_size integer DEFAULT 10)
RETURNS SETOF rag_sync_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Use CTE to atomically claim and return
  RETURN QUERY
  WITH claimed AS (
    SELECT q.id
    FROM rag_sync_queue q
    WHERE q.status = 'pending'
      AND q.attempts < q.max_attempts
    ORDER BY q.priority DESC, q.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE rag_sync_queue q
    SET 
      status = 'processing',
      started_at = now(),
      attempts = q.attempts + 1
    FROM claimed c
    WHERE q.id = c.id
    RETURNING q.*
  )
  SELECT * FROM updated;
END;
$function$;

-- ==========================================
-- Add worker_id column for parallel processing
-- ==========================================
ALTER TABLE rag_sync_queue 
ADD COLUMN IF NOT EXISTS worker_id TEXT;

-- Add index for parallel worker filtering
CREATE INDEX IF NOT EXISTS idx_rag_sync_queue_worker 
ON rag_sync_queue(worker_id) WHERE worker_id IS NOT NULL;

-- ==========================================
-- New function: Claim batch for specific worker (parallel processing)
-- ==========================================
CREATE OR REPLACE FUNCTION public.claim_rag_sync_batch_for_worker(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 10
)
RETURNS SETOF rag_sync_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT q.id
    FROM rag_sync_queue q
    WHERE q.status = 'pending'
      AND q.attempts < q.max_attempts
      AND (q.worker_id IS NULL OR q.worker_id = p_worker_id)
    ORDER BY q.priority DESC, q.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE rag_sync_queue q
    SET 
      status = 'processing',
      started_at = now(),
      attempts = q.attempts + 1,
      worker_id = p_worker_id
    FROM claimed c
    WHERE q.id = c.id
    RETURNING q.*
  )
  SELECT * FROM updated;
END;
$function$;

-- ==========================================
-- New function: Get active workers count
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_active_rag_workers()
RETURNS TABLE(worker_id TEXT, items_processing INTEGER, last_activity TIMESTAMPTZ)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    q.worker_id,
    COUNT(*)::INTEGER as items_processing,
    MAX(q.started_at) as last_activity
  FROM rag_sync_queue q
  WHERE q.status = 'processing'
    AND q.worker_id IS NOT NULL
    AND q.started_at > now() - INTERVAL '10 minutes'
  GROUP BY q.worker_id;
$function$;

-- ==========================================
-- Add configuration for parallel processing
-- ==========================================
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('rag_sync_worker_concurrency', '3', 'Número de workers paralelos para processamento RAG'),
  ('rag_sync_batch_delay_ms', '500', 'Delay entre batches em ms')
ON CONFLICT (chave) DO NOTHING;

-- ==========================================
-- Add last_modified_at column for delta sync
-- ==========================================
ALTER TABLE rag_sync_queue 
ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMPTZ;

-- Index for delta sync queries
CREATE INDEX IF NOT EXISTS idx_rag_sync_queue_modified 
ON rag_sync_queue(last_modified_at DESC) WHERE status = 'pending';

-- ==========================================
-- Cleanup function for stale processing items
-- ==========================================
CREATE OR REPLACE FUNCTION public.cleanup_stale_rag_processing()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  reset_count INTEGER;
BEGIN
  -- Reset items stuck in 'processing' for more than 10 minutes
  UPDATE rag_sync_queue
  SET 
    status = 'pending',
    worker_id = NULL,
    started_at = NULL
  WHERE status = 'processing'
    AND started_at < now() - INTERVAL '10 minutes';
  
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$function$;