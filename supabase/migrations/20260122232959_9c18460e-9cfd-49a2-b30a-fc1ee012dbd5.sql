-- Create table for dynamic message templates (Triage, Audio Offers, Fallbacks)
CREATE TABLE IF NOT EXISTS public.sofia_message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  subcategory TEXT,
  template_key TEXT NOT NULL,
  template_text TEXT NOT NULL,
  variables TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 100,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(category, template_key)
);

-- Enable RLS
ALTER TABLE public.sofia_message_templates ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated users (admin UI)
CREATE POLICY "Templates viewable by authenticated users" 
ON public.sofia_message_templates FOR SELECT 
USING (true);

-- Allow insert/update/delete for admins
CREATE POLICY "Templates manageable by authenticated users" 
ON public.sofia_message_templates FOR ALL 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_sofia_message_templates_updated_at
BEFORE UPDATE ON public.sofia_message_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();