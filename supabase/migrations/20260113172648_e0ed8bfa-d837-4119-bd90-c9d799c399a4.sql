-- Add lead scoring and mode columns to chatbot_conversas
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS sofia_mode TEXT DEFAULT 'standard';
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS has_simulation BOOLEAN DEFAULT false;
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS followup_stage TEXT; -- null, 'd1', 'd3', 'd7'
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS response_times_seconds INTEGER[] DEFAULT '{}';

-- Create index for mode filtering
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_sofia_mode ON chatbot_conversas(sofia_mode);
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_lead_score ON chatbot_conversas(lead_score);
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_lead_source ON chatbot_conversas(lead_source);
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_followup ON chatbot_conversas(followup_stage, followup_sent_at);