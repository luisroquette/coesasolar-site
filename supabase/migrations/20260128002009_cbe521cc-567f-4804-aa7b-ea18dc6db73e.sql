-- Create table to map WhatsApp LIDs to real phone numbers
-- This enables #ASSUMIR command to work in multi-device mode
CREATE TABLE IF NOT EXISTS public.whatsapp_lid_phone_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_lid TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create unique index to prevent duplicates (one mapping per LID per agent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_lid_phone_mapping_unique 
ON public.whatsapp_lid_phone_mapping (chat_lid, agent_id);

-- Index for fast lookups by LID
CREATE INDEX IF NOT EXISTS idx_whatsapp_lid_phone_mapping_lid 
ON public.whatsapp_lid_phone_mapping (chat_lid);

-- Index for cleanup of old mappings
CREATE INDEX IF NOT EXISTS idx_whatsapp_lid_phone_mapping_last_seen 
ON public.whatsapp_lid_phone_mapping (last_seen_at);

-- Add comment explaining the table purpose
COMMENT ON TABLE public.whatsapp_lid_phone_mapping IS 'Maps WhatsApp LIDs (internal identifiers used in multi-device mode) to normalized phone numbers. Enables operator commands like #ASSUMIR to work when Z-API sends LID instead of phone number.';

-- Enable RLS (this table is system-only, no user access needed)
ALTER TABLE public.whatsapp_lid_phone_mapping ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access only
CREATE POLICY "Service role can manage LID mappings" 
ON public.whatsapp_lid_phone_mapping 
FOR ALL 
USING (true) 
WITH CHECK (true);