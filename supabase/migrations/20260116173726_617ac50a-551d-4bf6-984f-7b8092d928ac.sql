-- Fix trigger to handle proposals without user_id (created by Sofia)
CREATE OR REPLACE FUNCTION public.sync_crm_from_proposta_assinante()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_email TEXT;
  v_user_nome TEXT;
  v_existing_id UUID;
BEGIN
  -- Skip if user_id is null (proposals created by Sofia/system)
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

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
$function$;