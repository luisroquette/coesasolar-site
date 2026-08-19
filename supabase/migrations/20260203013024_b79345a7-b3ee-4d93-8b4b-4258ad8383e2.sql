-- =====================================================
-- ORCHESTRATOR PHASE LOGS TABLE
-- Tracks timing and results of each pipeline phase
-- =====================================================

CREATE TABLE IF NOT EXISTS public.orchestrator_phase_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Trace context
  trace_id TEXT NOT NULL,
  conversa_id UUID,
  message_id TEXT,
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  adapter_class TEXT,
  
  -- Phase identification
  phase_name TEXT NOT NULL,
  phase_index INTEGER NOT NULL,
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Result
  status TEXT NOT NULL DEFAULT 'started',
  handled BOOLEAN DEFAULT false,
  skipped BOOLEAN DEFAULT false,
  skip_reason TEXT,
  
  -- Output
  action TEXT,
  response_summary TEXT,
  
  -- Error tracking
  error_type TEXT,
  error_message TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Performance indices
CREATE INDEX IF NOT EXISTS idx_orchestrator_phase_trace 
  ON public.orchestrator_phase_logs(trace_id);

CREATE INDEX IF NOT EXISTS idx_orchestrator_phase_conversa 
  ON public.orchestrator_phase_logs(conversa_id);

CREATE INDEX IF NOT EXISTS idx_orchestrator_phase_name 
  ON public.orchestrator_phase_logs(phase_name);

CREATE INDEX IF NOT EXISTS idx_orchestrator_phase_created 
  ON public.orchestrator_phase_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orchestrator_phase_agent 
  ON public.orchestrator_phase_logs(agent_id);

-- Partial index for slow phases (optimization)
CREATE INDEX IF NOT EXISTS idx_orchestrator_phase_slow 
  ON public.orchestrator_phase_logs(duration_ms) 
  WHERE duration_ms > 1000;

-- =====================================================
-- ANALYTICS VIEWS
-- =====================================================

-- Hourly performance aggregation
CREATE OR REPLACE VIEW public.v_phase_performance_hourly WITH (security_invoker = true) AS
SELECT 
  date_trunc('hour', created_at) as hour,
  phase_name,
  agent_id,
  COUNT(*) as executions,
  AVG(duration_ms)::INTEGER as avg_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::INTEGER as p95_duration_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms)::INTEGER as p99_duration_ms,
  MIN(duration_ms) as min_duration_ms,
  MAX(duration_ms) as max_duration_ms,
  SUM(CASE WHEN handled THEN 1 ELSE 0 END) as handled_count,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
  SUM(CASE WHEN skipped THEN 1 ELSE 0 END) as skipped_count
FROM public.orchestrator_phase_logs
WHERE created_at > now() - INTERVAL '7 days'
GROUP BY 1, 2, 3
ORDER BY hour DESC, phase_name;

-- Slow phases view for alerts
CREATE OR REPLACE VIEW public.v_slow_phases WITH (security_invoker = true) AS
SELECT 
  trace_id,
  conversa_id,
  agent_id,
  phase_name,
  duration_ms,
  status,
  error_type,
  error_message,
  metadata,
  created_at
FROM public.orchestrator_phase_logs
WHERE duration_ms > 1000
ORDER BY created_at DESC
LIMIT 100;

-- Bottlenecks by agent view
CREATE OR REPLACE VIEW public.v_phase_bottlenecks_by_agent WITH (security_invoker = true) AS
SELECT 
  agent_id,
  adapter_class,
  phase_name,
  COUNT(*) as total_executions,
  AVG(duration_ms)::INTEGER as avg_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::INTEGER as p95_ms,
  MAX(duration_ms) as max_ms,
  SUM(CASE WHEN duration_ms > 500 THEN 1 ELSE 0 END) as slow_count,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as error_count,
  ROUND(SUM(CASE WHEN handled THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) as handle_rate_pct
FROM public.orchestrator_phase_logs
WHERE created_at > now() - INTERVAL '24 hours'
GROUP BY agent_id, adapter_class, phase_name
HAVING AVG(duration_ms) > 200
ORDER BY avg_ms DESC;

-- Trace view for debugging
CREATE OR REPLACE VIEW public.v_orchestrator_trace WITH (security_invoker = true) AS
SELECT 
  trace_id,
  conversa_id,
  agent_id,
  adapter_class,
  jsonb_agg(
    jsonb_build_object(
      'phase', phase_name,
      'index', phase_index,
      'duration_ms', duration_ms,
      'status', status,
      'handled', handled,
      'action', action,
      'error', error_message
    ) ORDER BY phase_index
  ) as phases,
  SUM(duration_ms) as total_duration_ms,
  COUNT(*) as phase_count,
  MIN(started_at) as started_at,
  MAX(ended_at) as ended_at,
  bool_or(status = 'failed') as has_errors
FROM public.orchestrator_phase_logs
WHERE created_at > now() - INTERVAL '24 hours'
GROUP BY trace_id, conversa_id, agent_id, adapter_class
ORDER BY started_at DESC;

-- =====================================================
-- CLEANUP FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_orchestrator_phase_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.orchestrator_phase_logs
  WHERE created_at < now() - INTERVAL '14 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE public.orchestrator_phase_logs ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage orchestrator_phase_logs"
  ON public.orchestrator_phase_logs
  FOR ALL
  USING (public.is_admin(auth.uid()));

-- Service role access (for edge functions)
CREATE POLICY "Service role can insert orchestrator_phase_logs"
  ON public.orchestrator_phase_logs
  FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE public.orchestrator_phase_logs IS 'Tracks timing and results of each phase in the Sofia orchestrator pipeline for observability and debugging';
COMMENT ON VIEW public.v_phase_performance_hourly IS 'Hourly aggregated performance metrics per phase and agent';
COMMENT ON VIEW public.v_slow_phases IS 'Recent slow phases (>1000ms) for alerting';
COMMENT ON VIEW public.v_phase_bottlenecks_by_agent IS 'Identifies bottleneck phases by agent in the last 24h';
COMMENT ON VIEW public.v_orchestrator_trace IS 'Full trace view for debugging individual requests';