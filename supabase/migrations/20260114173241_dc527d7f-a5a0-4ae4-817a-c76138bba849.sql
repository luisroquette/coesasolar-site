-- Create table for on-call attendants who receive escalation notifications
CREATE TABLE public.whatsapp_atendentes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_plantao BOOLEAN DEFAULT false,
  escalacoes_recebidas INTEGER DEFAULT 0,
  last_escalation_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_atendentes ENABLE ROW LEVEL SECURITY;

-- Only admins can manage attendants
CREATE POLICY "Admins can view attendants" 
ON public.whatsapp_atendentes 
FOR SELECT 
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert attendants" 
ON public.whatsapp_atendentes 
FOR INSERT 
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update attendants" 
ON public.whatsapp_atendentes 
FOR UPDATE 
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete attendants" 
ON public.whatsapp_atendentes 
FOR DELETE 
USING (public.is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_whatsapp_atendentes_updated_at
BEFORE UPDATE ON public.whatsapp_atendentes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add column to track which attendant was notified on escalation
ALTER TABLE public.chatbot_conversas 
ADD COLUMN IF NOT EXISTS atendente_notificado_id UUID REFERENCES public.whatsapp_atendentes(id),
ADD COLUMN IF NOT EXISTS atendente_notificado_nome TEXT,
ADD COLUMN IF NOT EXISTS atendente_notificado_at TIMESTAMP WITH TIME ZONE;

-- Add configuration for escalation mode
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES ('escalacao_modo', 'plantao_fixo', 'Modo de escalação: plantao_fixo, round_robin, todos')
ON CONFLICT (chave) DO NOTHING;

-- Comment for documentation
COMMENT ON TABLE public.whatsapp_atendentes IS 'Atendentes humanos que recebem notificações de escalação via WhatsApp';