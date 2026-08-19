-- ============================================================
-- RAG Sync Queue: Sistema de processamento em lotes
-- Resolve timeout da função onedrive-sync
-- ============================================================

-- 1. Tabela de fila de processamento
CREATE TABLE IF NOT EXISTS public.rag_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_log_id UUID REFERENCES rag_sync_logs(id) ON DELETE CASCADE,
  onedrive_item_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_size BIGINT DEFAULT 0,
  mime_type TEXT,
  category TEXT DEFAULT 'geral',
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  last_modified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  document_id UUID REFERENCES rag_documents(id),
  CONSTRAINT unique_queue_item UNIQUE (sync_log_id, onedrive_item_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_rag_sync_queue_status ON rag_sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_rag_sync_queue_sync_log ON rag_sync_queue(sync_log_id);
CREATE INDEX IF NOT EXISTS idx_rag_sync_queue_pending ON rag_sync_queue(status, priority DESC, created_at ASC) WHERE status = 'pending';

-- 2. Habilitar RLS
ALTER TABLE public.rag_sync_queue ENABLE ROW LEVEL SECURITY;

-- Políticas (admin full access)
CREATE POLICY "Admins can manage sync queue" ON public.rag_sync_queue
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Corrigir syncs travados (status 'running' há mais de 1 hora)
UPDATE rag_sync_logs 
SET 
  status = 'timeout', 
  error_message = 'Sync expirou antes de completar (limite de 60s da Edge Function)',
  completed_at = COALESCE(completed_at, started_at + INTERVAL '60 seconds')
WHERE status = 'running' 
  AND started_at < NOW() - INTERVAL '1 hour';

-- 4. Configurações do sistema para batch processing
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('rag_sync_batch_size', '10', 'Número de arquivos processados por lote do batch-processor'),
  ('rag_sync_max_retries', '3', 'Tentativas máximas antes de marcar como falha permanente'),
  ('rag_sync_worker_concurrency', '3', 'Número de workers paralelos para processamento'),
  ('rag_sync_batch_delay_ms', '500', 'Delay entre batches para evitar rate limiting')
ON CONFLICT (chave) DO NOTHING;

-- 5. Função para obter próximo lote de arquivos para processar
CREATE OR REPLACE FUNCTION claim_rag_sync_batch(p_batch_size INTEGER DEFAULT 10)
RETURNS SETOF rag_sync_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_claimed_ids UUID[];
BEGIN
  -- Seleciona e marca como 'processing' atomicamente
  WITH to_claim AS (
    SELECT id
    FROM rag_sync_queue
    WHERE status = 'pending'
      AND attempts < max_attempts
    ORDER BY priority DESC, created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE rag_sync_queue q
  SET 
    status = 'processing',
    started_at = now(),
    attempts = attempts + 1
  FROM to_claim
  WHERE q.id = to_claim.id
  RETURNING q.id INTO v_claimed_ids;

  -- Retorna os registros atualizados
  RETURN QUERY
  SELECT * FROM rag_sync_queue
  WHERE id = ANY(v_claimed_ids);
END;
$$;

-- 6. Função para obter estatísticas da fila
CREATE OR REPLACE FUNCTION get_rag_sync_queue_stats(p_sync_log_id UUID DEFAULT NULL)
RETURNS TABLE(
  total INTEGER,
  pending INTEGER,
  processing INTEGER,
  completed INTEGER,
  failed INTEGER,
  skipped INTEGER,
  avg_process_time_ms FLOAT,
  estimated_remaining_minutes FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_avg_time FLOAT;
  v_pending_count INTEGER;
BEGIN
  SELECT 
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE status = 'pending')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'processing')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'completed')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'failed')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'skipped')::INTEGER,
    AVG(EXTRACT(EPOCH FROM (processed_at - started_at)) * 1000) FILTER (WHERE processed_at IS NOT NULL)
  INTO 
    total, pending, processing, completed, failed, skipped, v_avg_time
  FROM rag_sync_queue
  WHERE (p_sync_log_id IS NULL OR sync_log_id = p_sync_log_id);

  avg_process_time_ms := COALESCE(v_avg_time, 5000); -- default 5s per file
  
  -- Estimar tempo restante (pendentes * avg_time / 1000 / 60)
  v_pending_count := pending + processing;
  estimated_remaining_minutes := (v_pending_count * COALESCE(v_avg_time, 5000)) / 1000.0 / 60.0;

  RETURN NEXT;
END;
$$;

-- 7. Trigger para atualizar estatísticas do sync_log quando um item é processado
CREATE OR REPLACE FUNCTION update_sync_log_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stats RECORD;
BEGIN
  -- Apenas atualiza quando item é finalizado
  IF NEW.status IN ('completed', 'failed', 'skipped') AND OLD.status != NEW.status THEN
    SELECT * INTO v_stats FROM get_rag_sync_queue_stats(NEW.sync_log_id);
    
    UPDATE rag_sync_logs
    SET
      documents_scanned = v_stats.total,
      documents_added = v_stats.completed,
      documents_failed = v_stats.failed,
      documents_skipped = v_stats.skipped,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'queue_stats', jsonb_build_object(
          'pending', v_stats.pending,
          'processing', v_stats.processing,
          'avg_time_ms', v_stats.avg_process_time_ms
        )
      )
    WHERE id = NEW.sync_log_id;
    
    -- Se não há mais pendentes, marca como completed
    IF v_stats.pending = 0 AND v_stats.processing = 0 THEN
      UPDATE rag_sync_logs
      SET 
        status = 'completed',
        completed_at = now()
      WHERE id = NEW.sync_log_id
        AND status = 'running';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_sync_log_stats
AFTER UPDATE ON rag_sync_queue
FOR EACH ROW
EXECUTE FUNCTION update_sync_log_stats();

-- 8. Habilitar realtime para monitoramento
ALTER PUBLICATION supabase_realtime ADD TABLE public.rag_sync_queue;