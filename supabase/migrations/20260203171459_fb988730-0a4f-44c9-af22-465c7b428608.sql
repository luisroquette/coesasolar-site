-- Create table for FSM trace logs (observability)
CREATE TABLE IF NOT EXISTS public.fsm_trace_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT NOT NULL,
  conversa_id UUID REFERENCES public.chatbot_conversas(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  phone TEXT,
  events JSONB NOT NULL DEFAULT '[]',
  summary JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_fsm_trace_logs_conversa_id ON public.fsm_trace_logs(conversa_id);
CREATE INDEX IF NOT EXISTS idx_fsm_trace_logs_trace_id ON public.fsm_trace_logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_fsm_trace_logs_created_at ON public.fsm_trace_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fsm_trace_logs_agent_id ON public.fsm_trace_logs(agent_id);

-- Enable RLS
ALTER TABLE public.fsm_trace_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read logs (admin only pattern)
CREATE POLICY "fsm_trace_logs_select_authenticated" ON public.fsm_trace_logs
  FOR SELECT TO authenticated
  USING (true);

-- Allow service role to insert logs
CREATE POLICY "fsm_trace_logs_insert_service" ON public.fsm_trace_logs
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Auto-cleanup old logs (keep 30 days)
COMMENT ON TABLE public.fsm_trace_logs IS 'FSM observability logs for Formulário Livre Guiado. Auto-cleanup recommended after 30 days.';