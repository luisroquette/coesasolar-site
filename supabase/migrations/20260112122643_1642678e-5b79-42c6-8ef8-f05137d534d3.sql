-- Tabela de preferências de e-mail por usuário
CREATE TABLE public.email_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email_enabled BOOLEAN DEFAULT true,
  notify_proposta_aceita BOOLEAN DEFAULT true,
  notify_proposta_criada BOOLEAN DEFAULT true,
  notify_meta_atingida BOOLEAN DEFAULT true,
  notify_proposta_excluida BOOLEAN DEFAULT false,
  notify_novo_usuario BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own email preferences"
ON public.email_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own email preferences"
ON public.email_preferences FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email preferences"
ON public.email_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all email preferences"
ON public.email_preferences FOR SELECT
USING (public.is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_email_preferences_updated_at
BEFORE UPDATE ON public.email_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create email preferences when a new profile is created
CREATE OR REPLACE FUNCTION public.handle_new_profile_email_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.email_preferences (user_id)
  VALUES (NEW.user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_create_email_preferences
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_profile_email_preferences();

-- Create email preferences for existing users
INSERT INTO public.email_preferences (user_id)
SELECT user_id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- Table to log sent emails for tracking
CREATE TABLE public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID REFERENCES public.admin_notifications(id),
  recipient_user_id UUID,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  notification_type TEXT,
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for email_logs
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view email logs
CREATE POLICY "Admins can view email logs"
ON public.email_logs FOR SELECT
USING (public.is_admin(auth.uid()));