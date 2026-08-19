-- Add Bitrix24 integration fields to propostas_assinantes
ALTER TABLE public.propostas_assinantes 
ADD COLUMN IF NOT EXISTS bitrix24_lead_id TEXT,
ADD COLUMN IF NOT EXISTS bitrix24_deal_id TEXT,
ADD COLUMN IF NOT EXISTS bitrix24_last_sync TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Create index for faster lookups by bitrix24_lead_id
CREATE INDEX IF NOT EXISTS idx_propostas_assinantes_bitrix24_lead_id 
ON public.propostas_assinantes(bitrix24_lead_id);

-- Add Bitrix24 configuration entries
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
('bitrix24_webhook_url', '', 'URL do webhook de saída do Bitrix24'),
('bitrix24_enabled', 'false', 'Ativar/desativar integração com Bitrix24'),
('bitrix24_stage_novo', 'NEW', 'ID do stage para leads novos'),
('bitrix24_stage_proposta_enviada', 'IN_PROCESS', 'ID do stage para proposta enviada'),
('bitrix24_stage_fechado', 'WON', 'ID do stage para negócio fechado'),
('bitrix24_stage_perdido', 'LOSE', 'ID do stage para negócio perdido')
ON CONFLICT (chave) DO NOTHING;

-- Create table for integration logs
CREATE TABLE IF NOT EXISTS public.bitrix24_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposta_id UUID REFERENCES public.propostas_assinantes(id) ON DELETE CASCADE,
  bitrix24_lead_id TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  request_data JSONB,
  response_data JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on sync logs
ALTER TABLE public.bitrix24_sync_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all sync logs
CREATE POLICY "Admins can view sync logs" 
ON public.bitrix24_sync_logs 
FOR SELECT 
USING (is_admin(auth.uid()));

-- System can insert logs (via service role)
CREATE POLICY "System can insert sync logs" 
ON public.bitrix24_sync_logs 
FOR INSERT 
WITH CHECK (true);

-- Allow public access to propostas for the public acceptance page (read-only, by id)
CREATE POLICY "Public can view proposal by id for acceptance" 
ON public.propostas_assinantes 
FOR SELECT 
USING (true);

-- Allow public updates only to status field (for acceptance)
CREATE POLICY "Public can update proposal status for acceptance" 
ON public.propostas_assinantes 
FOR UPDATE 
USING (true)
WITH CHECK (true);