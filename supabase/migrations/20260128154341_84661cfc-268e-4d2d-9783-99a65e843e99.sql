-- Table for guardrail events tracking
CREATE TABLE public.sofia_guardrail_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Identification
  conversa_id UUID REFERENCES chatbot_conversas(id) ON DELETE SET NULL,
  cliente_telefone TEXT,
  cliente_nome TEXT,
  agent_id TEXT,
  
  -- Categorization
  category TEXT NOT NULL,
  block_type TEXT,
  severity TEXT DEFAULT 'warning',
  
  -- Context
  original_message TEXT,
  corrected_message TEXT,
  context JSONB,
  
  -- Resolution
  status TEXT DEFAULT 'open',
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  resolution_notes TEXT,
  applied_rule_id UUID,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_guardrail_events_category ON sofia_guardrail_events(category);
CREATE INDEX idx_guardrail_events_status ON sofia_guardrail_events(status);
CREATE INDEX idx_guardrail_events_created_at ON sofia_guardrail_events(created_at DESC);
CREATE INDEX idx_guardrail_events_conversa_id ON sofia_guardrail_events(conversa_id);

-- RLS
ALTER TABLE sofia_guardrail_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated" ON sofia_guardrail_events
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow insert for authenticated" ON sofia_guardrail_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update for admins" ON sofia_guardrail_events
  FOR UPDATE USING (public.is_admin(auth.uid()));

CREATE POLICY "Allow delete for admins" ON sofia_guardrail_events
  FOR DELETE USING (public.is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_sofia_guardrail_events_updated_at
  BEFORE UPDATE ON sofia_guardrail_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();