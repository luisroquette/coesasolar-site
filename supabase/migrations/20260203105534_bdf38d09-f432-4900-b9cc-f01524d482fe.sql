-- Create observability_snapshots table for aggregated metrics persistence
CREATE TABLE IF NOT EXISTS public.observability_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL,
  period TEXT NOT NULL DEFAULT 'session',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Summary
  summary JSONB NOT NULL DEFAULT '{}',
  
  -- Metrics by domain
  passive_context JSONB DEFAULT '{}',
  rule_memory JSONB DEFAULT '{}',
  rag_quality JSONB DEFAULT '{}',
  phase_latency JSONB DEFAULT '{}',
  
  -- Alerts and targets
  alerts JSONB DEFAULT '[]',
  target_comparison JSONB DEFAULT '[]',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_observability_snapshots_agent_id 
  ON public.observability_snapshots(agent_id);

CREATE INDEX IF NOT EXISTS idx_observability_snapshots_generated_at 
  ON public.observability_snapshots(generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_observability_snapshots_period 
  ON public.observability_snapshots(period);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_observability_snapshots_agent_period 
  ON public.observability_snapshots(agent_id, period, generated_at DESC);

-- Enable RLS
ALTER TABLE public.observability_snapshots ENABLE ROW LEVEL SECURITY;

-- Policy for service role (edge functions)
CREATE POLICY "Service role can manage observability snapshots"
  ON public.observability_snapshots
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE public.observability_snapshots IS 
  'Stores aggregated observability metrics for the AGENTS.md-Style architecture';

-- Add cleanup function for old snapshots
CREATE OR REPLACE FUNCTION public.cleanup_old_observability_snapshots(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.observability_snapshots
  WHERE generated_at < now() - (retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;