-- Phase 2 & 3: Add column for tracking and create locks table for atomic deduplication

-- New column to track when proposal link was sent to conversation
ALTER TABLE chatbot_conversas 
ADD COLUMN IF NOT EXISTS proposta_link_sent_at TIMESTAMPTZ;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_conversas_proposta_link_sent ON chatbot_conversas(proposta_link_sent_at) WHERE proposta_link_sent_at IS NOT NULL;

-- Table for atomic locks to prevent race conditions
CREATE TABLE IF NOT EXISTS bitrix24_sync_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_key TEXT UNIQUE NOT NULL,
  lead_id TEXT NOT NULL,
  acquired_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for cleanup operations
CREATE INDEX IF NOT EXISTS idx_sync_locks_acquired ON bitrix24_sync_locks(acquired_at);

-- RLS policies for locks table
ALTER TABLE bitrix24_sync_locks ENABLE ROW LEVEL SECURITY;

-- Service role can manage locks
CREATE POLICY "Service role can manage sync locks"
ON bitrix24_sync_locks
FOR ALL
USING (true)
WITH CHECK (true);

-- Function to cleanup old locks (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_sync_locks()
RETURNS void AS $$
BEGIN
  DELETE FROM bitrix24_sync_locks 
  WHERE acquired_at < now() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update cooldown configuration to 5 minutes (300000ms) for more aggressive dedup
UPDATE configuracoes_sistema 
SET valor = '300000', updated_at = now()
WHERE chave = 'bitrix_link_cooldown_ms';

-- Insert if not exists
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES ('bitrix_link_cooldown_ms', '300000', 'Cooldown em milissegundos entre envios de link da mesma proposta (5 minutos)')
ON CONFLICT (chave) DO UPDATE SET valor = '300000', updated_at = now();