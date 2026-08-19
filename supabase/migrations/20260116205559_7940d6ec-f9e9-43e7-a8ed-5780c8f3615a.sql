-- Tabela para armazenar os contatos/departamentos da COESA
CREATE TABLE public.coesa_contatos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identificador TEXT NOT NULL UNIQUE, -- Ex: 'financeiro', 'atendimento', 'comercial'
  nome TEXT NOT NULL, -- Ex: 'Financeiro', 'Atendimento ao Cliente'
  telefone TEXT NOT NULL, -- Ex: '5531984400889'
  descricao TEXT, -- Descrição do departamento
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Inserir contatos iniciais
INSERT INTO public.coesa_contatos (identificador, nome, telefone, descricao) VALUES
  ('financeiro', 'Financeiro', '5531984400889', 'Questões financeiras, boletos, pagamentos'),
  ('atendimento', 'Atendimento ao Cliente', '5531984400889', 'Demais questões e suporte geral');

-- Enable RLS
ALTER TABLE public.coesa_contatos ENABLE ROW LEVEL SECURITY;

-- Políticas - apenas usuários autenticados podem gerenciar
CREATE POLICY "Usuários autenticados podem ver contatos" 
ON public.coesa_contatos 
FOR SELECT 
USING (true);

CREATE POLICY "Usuários autenticados podem inserir contatos" 
ON public.coesa_contatos 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem atualizar contatos" 
ON public.coesa_contatos 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem deletar contatos" 
ON public.coesa_contatos 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Trigger para updated_at
CREATE TRIGGER update_coesa_contatos_updated_at
BEFORE UPDATE ON public.coesa_contatos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();