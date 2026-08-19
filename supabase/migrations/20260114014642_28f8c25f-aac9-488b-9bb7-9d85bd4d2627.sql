-- Create table for authorized test phone numbers
CREATE TABLE public.whatsapp_test_phones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_test_phones ENABLE ROW LEVEL SECURITY;

-- Only admins can manage test phones
CREATE POLICY "Admins can view test phones"
ON public.whatsapp_test_phones
FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert test phones"
ON public.whatsapp_test_phones
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update test phones"
ON public.whatsapp_test_phones
FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete test phones"
ON public.whatsapp_test_phones
FOR DELETE
USING (public.is_admin(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_whatsapp_test_phones_updated_at
BEFORE UPDATE ON public.whatsapp_test_phones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial data (migrating from hardcoded values)
INSERT INTO public.whatsapp_test_phones (phone_number, name) VALUES
  ('5531994584876', 'Lucas'),
  ('5531994077766', 'Jorge'),
  ('5531989988997', 'Fernanda'),
  ('5531991703646', 'Usuário');