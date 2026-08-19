-- Create table for system configurations
CREATE TABLE public.configuracoes_sistema (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chave TEXT NOT NULL UNIQUE,
  valor TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;

-- Policies - All authenticated users can read configs
CREATE POLICY "Authenticated users can view configs" 
ON public.configuracoes_sistema 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Only authenticated users can update configs
CREATE POLICY "Authenticated users can update configs" 
ON public.configuracoes_sistema 
FOR UPDATE 
USING (auth.role() = 'authenticated');

-- Only authenticated users can insert configs
CREATE POLICY "Authenticated users can insert configs" 
ON public.configuracoes_sistema 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Add trigger for updated_at
CREATE TRIGGER update_configuracoes_sistema_updated_at
BEFORE UPDATE ON public.configuracoes_sistema
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default values
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('whatsapp_numero', '5511999999999', 'Número de WhatsApp para contato (formato: 55 + DDD + número)'),
  ('email_contato', 'contato@coesaenergia.com.br', 'Email de contato principal'),
  ('telefone_contato', '(11) 99999-9999', 'Telefone para exibição no PDF'),
  ('empresa_nome', 'COESA Energia Inteligente', 'Nome da empresa'),
  ('empresa_slogan', 'Soluções em Energia Renovável', 'Slogan da empresa');