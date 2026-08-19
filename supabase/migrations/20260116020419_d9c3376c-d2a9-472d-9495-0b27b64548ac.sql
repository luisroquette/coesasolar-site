-- Add columns to track MASTER offer (30% + 4 years - last card)
-- This tracks when the offer was made and when it expires

ALTER TABLE public.chatbot_conversas
ADD COLUMN IF NOT EXISTS master_offer_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS master_offer_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS master_offer_accepted BOOLEAN DEFAULT false;

-- Add comment explaining the columns
COMMENT ON COLUMN public.chatbot_conversas.master_offer_at IS 'Timestamp when the MASTER offer (30% + 4 years) was made';
COMMENT ON COLUMN public.chatbot_conversas.master_offer_expires_at IS 'Timestamp when the MASTER offer expires (12 hours after offer)';
COMMENT ON COLUMN public.chatbot_conversas.master_offer_accepted IS 'Whether the client accepted the MASTER offer';