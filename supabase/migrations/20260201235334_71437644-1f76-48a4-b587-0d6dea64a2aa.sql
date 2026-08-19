-- ============================================================
-- DAILY REPORT RECIPIENTS - Destinatários do relatório diário
-- ============================================================

CREATE TABLE IF NOT EXISTS public.daily_report_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  notify_via TEXT[] DEFAULT ARRAY['whatsapp']::TEXT[], -- 'whatsapp', 'email'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_report_recipients ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage daily report recipients"
  ON public.daily_report_recipients
  FOR ALL
  USING (public.is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_daily_report_recipients_updated_at
  BEFORE UPDATE ON public.daily_report_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial recipients (Luis and Eric from the workflow)
INSERT INTO public.daily_report_recipients (nome, telefone, notify_via) VALUES
  ('Luis', '5531991703646', ARRAY['whatsapp']),
  ('Eric', '5531998889080', ARRAY['whatsapp']);

-- Add index for active recipients
CREATE INDEX idx_daily_report_recipients_active 
  ON public.daily_report_recipients(is_active) 
  WHERE is_active = true;