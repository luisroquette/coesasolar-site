-- Add triage_config column to ai_agents table
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS triage_config JSONB DEFAULT NULL;

-- Add comment explaining the field
COMMENT ON COLUMN public.ai_agents.triage_config IS 'Configuration for automatic triage/routing of existing clients to specific departments';