-- Create CRM contacts table
CREATE TABLE public.crm_contatos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Owner/Creator info
  user_id UUID NOT NULL,
  criado_por_email TEXT,
  criado_por_nome TEXT,
  
  -- Client data
  nome TEXT NOT NULL,
  cpf_cnpj TEXT,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  
  -- Source tracking
  origem TEXT DEFAULT 'proposta_assinante', -- proposta_assinante, proposta_usineiro, manual
  proposta_id UUID,
  proposta_tipo TEXT,
  
  -- CRM status for remarketing
  status TEXT DEFAULT 'novo', -- novo, contatado, interessado, negociando, fechado, perdido
  
  -- Extra info
  observacoes TEXT,
  ultima_interacao TIMESTAMP WITH TIME ZONE DEFAULT now(),
  valor_potencial NUMERIC,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_contatos ENABLE ROW LEVEL SECURITY;

-- Policies - Users can manage their own contacts
CREATE POLICY "Users can view their own contacts" 
ON public.crm_contatos FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contacts" 
ON public.crm_contatos FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contacts" 
ON public.crm_contatos FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contacts" 
ON public.crm_contatos FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_crm_contatos_updated_at
BEFORE UPDATE ON public.crm_contatos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to sync contact from proposal assinante
CREATE OR REPLACE FUNCTION public.sync_crm_from_proposta_assinante()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email TEXT;
  v_user_nome TEXT;
  v_existing_id UUID;
BEGIN
  -- Get user info
  SELECT email INTO v_user_email FROM auth.users WHERE id = NEW.user_id;
  SELECT nome INTO v_user_nome FROM public.profiles WHERE user_id = NEW.user_id;
  
  -- Check if contact already exists for this proposal
  SELECT id INTO v_existing_id 
  FROM public.crm_contatos 
  WHERE proposta_id = NEW.id AND proposta_tipo = 'assinante';
  
  IF v_existing_id IS NOT NULL THEN
    -- Update existing contact
    UPDATE public.crm_contatos SET
      nome = NEW.cliente_nome,
      cpf_cnpj = NEW.cliente_cpf_cnpj,
      email = NEW.cliente_email,
      telefone = NEW.cliente_telefone,
      endereco = NEW.cliente_endereco,
      cidade = NEW.cliente_cidade,
      uf = NEW.cliente_uf,
      cep = NEW.cliente_cep,
      valor_potencial = NEW.economia_acumulada,
      ultima_interacao = now(),
      updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    -- Insert new contact
    INSERT INTO public.crm_contatos (
      user_id, criado_por_email, criado_por_nome,
      nome, cpf_cnpj, email, telefone, endereco, cidade, uf, cep,
      origem, proposta_id, proposta_tipo, valor_potencial
    ) VALUES (
      NEW.user_id, v_user_email, v_user_nome,
      NEW.cliente_nome, NEW.cliente_cpf_cnpj, NEW.cliente_email, NEW.cliente_telefone,
      NEW.cliente_endereco, NEW.cliente_cidade, NEW.cliente_uf, NEW.cliente_cep,
      'proposta_assinante', NEW.id, 'assinante', NEW.economia_acumulada
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to sync on insert/update
CREATE TRIGGER sync_crm_on_proposta_assinante
AFTER INSERT OR UPDATE ON public.propostas_assinantes
FOR EACH ROW
EXECUTE FUNCTION public.sync_crm_from_proposta_assinante();

-- Create index for faster queries
CREATE INDEX idx_crm_contatos_user_id ON public.crm_contatos(user_id);
CREATE INDEX idx_crm_contatos_status ON public.crm_contatos(status);
CREATE INDEX idx_crm_contatos_created_at ON public.crm_contatos(created_at DESC);