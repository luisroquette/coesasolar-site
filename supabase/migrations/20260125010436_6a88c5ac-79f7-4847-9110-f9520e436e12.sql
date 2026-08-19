-- Create proposal generation queue for retry mechanism
CREATE TABLE IF NOT EXISTS public.proposal_generation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bitrix_lead_id TEXT NOT NULL,
  cliente_telefone TEXT,
  cliente_nome TEXT,
  conversa_id UUID REFERENCES public.chatbot_conversas(id),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  retry_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 seconds'),
  status TEXT DEFAULT 'pending', -- pending, processing, success, failed
  failure_reason TEXT,
  request_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT unique_pending_lead UNIQUE (bitrix_lead_id, status) 
    DEFERRABLE INITIALLY DEFERRED
);

-- Index for scheduler queries
CREATE INDEX idx_proposal_queue_retry ON public.proposal_generation_queue(retry_at, status) 
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.proposal_generation_queue ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on proposal queue"
  ON public.proposal_generation_queue
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Admins can view
CREATE POLICY "Admins can view proposal queue"
  ON public.proposal_generation_queue
  FOR SELECT
  USING (is_admin(auth.uid()));

COMMENT ON TABLE public.proposal_generation_queue IS 'Queue for automatic proposal generation retries when race conditions cause initial failures';