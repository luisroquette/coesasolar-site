-- =====================================================
-- UNIFIED AGENT CONFIGURATION TABLE
-- Source of Truth for all per-agent configurations
-- =====================================================

-- Create agent_configurations table with JSONB for flexibility
CREATE TABLE public.agent_configurations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id TEXT NOT NULL,
    config_namespace TEXT NOT NULL DEFAULT 'default',
    config_key TEXT NOT NULL,
    config_value JSONB NOT NULL,
    value_type TEXT NOT NULL DEFAULT 'string' CHECK (value_type IN ('string', 'number', 'boolean', 'json', 'array')),
    description TEXT,
    is_secret_reference BOOLEAN DEFAULT FALSE,
    secret_key_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    UNIQUE(agent_id, config_namespace, config_key)
);

-- Enable RLS
ALTER TABLE public.agent_configurations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for service role access (edge functions)
CREATE POLICY "Service role can read all configurations"
    ON public.agent_configurations
    FOR SELECT
    USING (true);

CREATE POLICY "Service role can manage configurations"
    ON public.agent_configurations
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Indexes for fast lookups
CREATE INDEX idx_agent_configurations_agent_id ON public.agent_configurations(agent_id);
CREATE INDEX idx_agent_configurations_namespace ON public.agent_configurations(config_namespace);
CREATE INDEX idx_agent_configurations_agent_namespace ON public.agent_configurations(agent_id, config_namespace);
CREATE INDEX idx_agent_configurations_lookup ON public.agent_configurations(agent_id, config_namespace, config_key);

-- Trigger to update updated_at
CREATE TRIGGER update_agent_configurations_updated_at
    BEFORE UPDATE ON public.agent_configurations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE public.agent_configurations IS 'Unified configuration source for per-agent settings with JSON validation';
COMMENT ON COLUMN public.agent_configurations.agent_id IS 'Reference to ai_agents.agent_id';
COMMENT ON COLUMN public.agent_configurations.config_namespace IS 'Logical grouping: nudges, quiet_hours, llm, integrations, etc.';
COMMENT ON COLUMN public.agent_configurations.config_value IS 'JSONB value allowing complex nested configs';
COMMENT ON COLUMN public.agent_configurations.is_secret_reference IS 'If true, actual value is in Lovable Secrets, config_value contains metadata only';
COMMENT ON COLUMN public.agent_configurations.secret_key_name IS 'Name of secret in Lovable Secrets if is_secret_reference=true';