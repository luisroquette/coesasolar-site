-- Add Z-API credentials per agent
-- Each agent can have their own Z-API instance for WhatsApp

ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS zapi_instance_id TEXT,
ADD COLUMN IF NOT EXISTS zapi_token TEXT,
ADD COLUMN IF NOT EXISTS zapi_security_token TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.ai_agents.zapi_instance_id IS 'Z-API Instance ID for this agent WhatsApp number';
COMMENT ON COLUMN public.ai_agents.zapi_token IS 'Z-API Token for this agent WhatsApp number';
COMMENT ON COLUMN public.ai_agents.zapi_security_token IS 'Z-API Security Token (Client-Token header) for this agent';