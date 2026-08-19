-- Create outbound_campaigns table
CREATE TABLE public.outbound_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  target_criteria JSONB DEFAULT '{}',
  schedule_config JSONB DEFAULT '{"start_hour": 9, "end_hour": 18, "days": [1,2,3,4,5]}',
  max_attempts INTEGER DEFAULT 3,
  retry_delay_hours INTEGER DEFAULT 24,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create outbound_call_queue table
CREATE TABLE public.outbound_call_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.outbound_campaigns(id) ON DELETE CASCADE,
  conversa_id UUID REFERENCES public.chatbot_conversas(id),
  bitrix_lead_id TEXT,
  phone TEXT NOT NULL,
  customer_name TEXT,
  priority INTEGER DEFAULT 0,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'calling', 'completed', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  retell_call_id TEXT,
  lead_context JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create outbound_call_results table
CREATE TABLE public.outbound_call_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id UUID NOT NULL REFERENCES public.outbound_call_queue(id) ON DELETE CASCADE,
  retell_call_id TEXT,
  call_duration_seconds INTEGER,
  outcome TEXT CHECK (outcome IN ('answered', 'no_answer', 'busy', 'voicemail', 'completed', 'failed', 'transferred')),
  transcript TEXT,
  summary TEXT,
  intent_detected TEXT,
  next_action TEXT,
  sentiment TEXT,
  recording_url TEXT,
  retell_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.outbound_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_call_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_call_results ENABLE ROW LEVEL SECURITY;

-- RLS policies for outbound_campaigns (admin and authenticated users can manage)
CREATE POLICY "Authenticated users can view campaigns" 
ON public.outbound_campaigns FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create campaigns" 
ON public.outbound_campaigns FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update campaigns" 
ON public.outbound_campaigns FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete campaigns" 
ON public.outbound_campaigns FOR DELETE 
USING (auth.role() = 'authenticated');

-- RLS policies for outbound_call_queue
CREATE POLICY "Authenticated users can view call queue" 
ON public.outbound_call_queue FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage call queue" 
ON public.outbound_call_queue FOR ALL 
USING (auth.role() = 'authenticated');

-- RLS policies for outbound_call_results
CREATE POLICY "Authenticated users can view call results" 
ON public.outbound_call_results FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert call results" 
ON public.outbound_call_results FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Service role policies for edge functions
CREATE POLICY "Service role full access campaigns" 
ON public.outbound_campaigns FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access queue" 
ON public.outbound_call_queue FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access results" 
ON public.outbound_call_results FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role');

-- Indexes for performance
CREATE INDEX idx_outbound_queue_status ON public.outbound_call_queue(status);
CREATE INDEX idx_outbound_queue_scheduled ON public.outbound_call_queue(scheduled_at);
CREATE INDEX idx_outbound_queue_campaign ON public.outbound_call_queue(campaign_id);
CREATE INDEX idx_outbound_results_queue ON public.outbound_call_results(queue_id);
CREATE INDEX idx_outbound_results_outcome ON public.outbound_call_results(outcome);

-- Update trigger for campaigns
CREATE TRIGGER update_outbound_campaigns_updated_at
BEFORE UPDATE ON public.outbound_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update trigger for queue
CREATE TRIGGER update_outbound_call_queue_updated_at
BEFORE UPDATE ON public.outbound_call_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();