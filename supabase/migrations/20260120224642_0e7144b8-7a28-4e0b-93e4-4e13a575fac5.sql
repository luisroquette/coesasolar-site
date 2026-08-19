-- Tabela para alertas de qualidade do RAG
CREATE TABLE public.rag_quality_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL,
  alert_type TEXT NOT NULL, -- 'low_hit_rate', 'no_results', 'slow_response'
  severity TEXT NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metric_value FLOAT,
  threshold_value FLOAT,
  period_days INTEGER DEFAULT 7,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_rag_quality_alerts_agent ON public.rag_quality_alerts(agent_id);
CREATE INDEX idx_rag_quality_alerts_unresolved ON public.rag_quality_alerts(is_resolved, created_at DESC);

-- RLS
ALTER TABLE public.rag_quality_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view RAG alerts"
ON public.rag_quality_alerts FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Authenticated users can update RAG alerts"
ON public.rag_quality_alerts FOR UPDATE
TO authenticated USING (true);

CREATE POLICY "Service can insert RAG alerts"
ON public.rag_quality_alerts FOR INSERT
TO authenticated WITH CHECK (true);

-- Função para verificar qualidade do RAG e gerar alertas
CREATE OR REPLACE FUNCTION public.check_rag_quality_alerts()
RETURNS TABLE(
  alerts_created INTEGER,
  agents_checked INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent RECORD;
  v_total_queries INTEGER;
  v_queries_with_results INTEGER;
  v_hit_rate FLOAT;
  v_avg_response_time FLOAT;
  v_alerts_created INTEGER := 0;
  v_agents_checked INTEGER := 0;
  v_threshold_hit_rate FLOAT := 0.50;
  v_threshold_response_time FLOAT := 2000; -- 2 seconds
  v_period_days INTEGER := 7;
BEGIN
  -- Check each active agent
  FOR v_agent IN 
    SELECT DISTINCT agent_id FROM rag_usage_logs 
    WHERE created_at > now() - (v_period_days || ' days')::INTERVAL
  LOOP
    v_agents_checked := v_agents_checked + 1;
    
    -- Calculate metrics for this agent
    SELECT 
      COUNT(*)::INTEGER,
      COUNT(*) FILTER (WHERE results_count > 0)::INTEGER,
      AVG(response_time_ms)::FLOAT
    INTO v_total_queries, v_queries_with_results, v_avg_response_time
    FROM rag_usage_logs
    WHERE agent_id = v_agent.agent_id
      AND created_at > now() - (v_period_days || ' days')::INTERVAL;
    
    -- Skip if not enough data
    IF v_total_queries < 10 THEN
      CONTINUE;
    END IF;
    
    v_hit_rate := v_queries_with_results::FLOAT / v_total_queries::FLOAT;
    
    -- Check for low hit rate
    IF v_hit_rate < v_threshold_hit_rate THEN
      -- Check if similar unresolved alert exists
      IF NOT EXISTS (
        SELECT 1 FROM rag_quality_alerts 
        WHERE agent_id = v_agent.agent_id 
          AND alert_type = 'low_hit_rate'
          AND is_resolved = false
          AND created_at > now() - INTERVAL '24 hours'
      ) THEN
        INSERT INTO rag_quality_alerts (
          agent_id, alert_type, severity, title, message,
          metric_value, threshold_value, period_days
        ) VALUES (
          v_agent.agent_id,
          'low_hit_rate',
          CASE WHEN v_hit_rate < 0.25 THEN 'critical' ELSE 'warning' END,
          'Taxa de acerto baixa',
          format('O agente %s está com apenas %.1f%% de taxa de acerto no RAG nos últimos %s dias. Considere adicionar mais documentos à base de conhecimento.', 
            v_agent.agent_id, v_hit_rate * 100, v_period_days),
          v_hit_rate,
          v_threshold_hit_rate,
          v_period_days
        );
        v_alerts_created := v_alerts_created + 1;
      END IF;
    END IF;
    
    -- Check for slow responses
    IF v_avg_response_time > v_threshold_response_time THEN
      IF NOT EXISTS (
        SELECT 1 FROM rag_quality_alerts 
        WHERE agent_id = v_agent.agent_id 
          AND alert_type = 'slow_response'
          AND is_resolved = false
          AND created_at > now() - INTERVAL '24 hours'
      ) THEN
        INSERT INTO rag_quality_alerts (
          agent_id, alert_type, severity, title, message,
          metric_value, threshold_value, period_days
        ) VALUES (
          v_agent.agent_id,
          'slow_response',
          'warning',
          'Respostas lentas do RAG',
          format('O tempo médio de resposta do RAG para %s é %.0fms (limite: %.0fms). Considere otimizar os embeddings.', 
            v_agent.agent_id, v_avg_response_time, v_threshold_response_time),
          v_avg_response_time,
          v_threshold_response_time,
          v_period_days
        );
        v_alerts_created := v_alerts_created + 1;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_alerts_created, v_agents_checked;
END;
$$;