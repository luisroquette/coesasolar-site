-- Add column to track when definitive proposal is ready
ALTER TABLE public.propostas_assinantes 
ADD COLUMN IF NOT EXISTS definitive_ready_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.propostas_assinantes.definitive_ready_at IS 
'Timestamp de quando a proposta definitiva ficou pronta para visualização';