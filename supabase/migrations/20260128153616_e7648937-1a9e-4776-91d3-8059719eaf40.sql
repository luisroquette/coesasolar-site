-- ═══════════════════════════════════════════════════════════════
-- CRM Pre-Check Configuration
-- ═══════════════════════════════════════════════════════════════

-- Enable/disable CRM pre-check
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('crm_precheck_enabled', 'true', 'Habilita pré-checagem de CRM obrigatória antes de triagem/LLM'),
  ('crm_precheck_cache_ttl_ms', '300000', 'TTL do cache de CRM em milissegundos (5 min = 300000)'),
  ('crm_quarantine_days_junk', '30', 'Dias de quarentena para leads descartados antes de permitir re-entrada'),
  ('crm_hot_lead_stages', '["UC_9SLRPP","UC_JENEX5","UC_AGUARDANDO_ASSINATURA"]', 'IDs de estágios considerados "lead quente" (modo closer)')
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  updated_at = now();

-- Create table for Bitrix stage configuration (if not exists)
CREATE TABLE IF NOT EXISTS public.bitrix_stages_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  should_skip_triage BOOLEAN DEFAULT false,
  should_skip_data_collection BOOLEAN DEFAULT false,
  recommended_mode TEXT DEFAULT 'standard',
  recommended_fast_path TEXT,
  is_blocked BOOLEAN DEFAULT false,
  block_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bitrix_stages_config ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow read for authenticated users" ON public.bitrix_stages_config
  FOR SELECT USING (true);

CREATE POLICY "Allow write for admins" ON public.bitrix_stages_config
  FOR ALL USING (public.is_admin(auth.uid()));

-- Insert default stage configurations
INSERT INTO bitrix_stages_config (stage_id, nome, sort_order, should_skip_triage, should_skip_data_collection, recommended_mode, recommended_fast_path, is_blocked) VALUES
  ('NEW', 'Novo Lead', 10, false, false, 'standard', NULL, false),
  ('UC_AGUARDANDO_DADOS', 'Aguardando Dados', 20, true, false, 'standard', NULL, false),
  ('UC_9SLRPP', 'Proposta Inicial', 30, true, true, 'closer', 'proposal_sent', false),
  ('UC_JENEX5', 'Proposta Definitiva', 40, true, true, 'closer', 'definitive_ready', false),
  ('UC_AGUARDANDO_ASSINATURA', 'Aguardando Assinatura', 50, true, true, 'closer', 'contract_pending', false),
  ('WON', 'Fechado/Ganho', 60, true, true, 'sac_redirect', 'existing_customer', false),
  ('JUNK', 'Descartado', 70, true, true, 'blocked', 'discarded_lead', true),
  ('LOSE', 'Perdido', 80, true, true, 'blocked', 'lost_lead', true)
ON CONFLICT (stage_id) DO UPDATE SET
  nome = EXCLUDED.nome,
  sort_order = EXCLUDED.sort_order,
  should_skip_triage = EXCLUDED.should_skip_triage,
  should_skip_data_collection = EXCLUDED.should_skip_data_collection,
  recommended_mode = EXCLUDED.recommended_mode,
  recommended_fast_path = EXCLUDED.recommended_fast_path,
  is_blocked = EXCLUDED.is_blocked,
  updated_at = now();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bitrix_stages_config_stage_id ON bitrix_stages_config(stage_id);

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER update_bitrix_stages_config_updated_at
  BEFORE UPDATE ON bitrix_stages_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();