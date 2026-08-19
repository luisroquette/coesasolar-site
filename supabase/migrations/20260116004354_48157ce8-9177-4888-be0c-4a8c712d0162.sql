
-- Create table for document recovery tracking
CREATE TABLE public.document_recovery_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id UUID REFERENCES public.chatbot_conversas(id),
  cliente_telefone TEXT,
  document_type TEXT NOT NULL,
  document_url TEXT,
  document_name TEXT,
  recovery_source TEXT, -- 'webhook_history', 'manual_fallback', 'complaint_triggered'
  original_event_id UUID,
  original_event_at TIMESTAMPTZ,
  was_successful BOOLEAN DEFAULT true,
  error_message TEXT,
  bitrix_lead_id TEXT,
  bitrix_stage_before TEXT,
  bitrix_stage_after TEXT,
  all_docs_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX idx_document_recovery_logs_conversa ON public.document_recovery_logs(conversa_id);
CREATE INDEX idx_document_recovery_logs_created_at ON public.document_recovery_logs(created_at);
CREATE INDEX idx_document_recovery_logs_document_type ON public.document_recovery_logs(document_type);
CREATE INDEX idx_document_recovery_logs_recovery_source ON public.document_recovery_logs(recovery_source);

-- Enable RLS
ALTER TABLE public.document_recovery_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for admins to view all logs
CREATE POLICY "Admins can view all recovery logs"
ON public.document_recovery_logs
FOR SELECT
USING (public.is_admin(auth.uid()));

-- Create table for aggregated recovery metrics (updated periodically)
CREATE TABLE public.document_recovery_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_date DATE NOT NULL,
  document_type TEXT NOT NULL,
  recovery_source TEXT NOT NULL,
  total_attempts INTEGER DEFAULT 0,
  successful_recoveries INTEGER DEFAULT 0,
  failed_recoveries INTEGER DEFAULT 0,
  led_to_complete_docs INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(metric_date, document_type, recovery_source)
);

-- Enable RLS
ALTER TABLE public.document_recovery_metrics ENABLE ROW LEVEL SECURITY;

-- Create policy for admins
CREATE POLICY "Admins can view recovery metrics"
ON public.document_recovery_metrics
FOR SELECT
USING (public.is_admin(auth.uid()));

-- Add comment for documentation
COMMENT ON TABLE public.document_recovery_logs IS 'Logs individual document recovery attempts for tracking and debugging';
COMMENT ON TABLE public.document_recovery_metrics IS 'Aggregated metrics for document recovery performance';
