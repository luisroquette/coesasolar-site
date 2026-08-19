-- Criar bucket para documentos de clientes
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos-clientes', 'documentos-clientes', false);

-- Políticas RLS para o bucket
-- Permitir upload anônimo (cliente sem login)
CREATE POLICY "Permitir upload anônimo de documentos"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'documentos-clientes');

-- Permitir leitura apenas para usuários autenticados
CREATE POLICY "Usuários autenticados podem ler documentos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documentos-clientes');

-- Criar tabela para solicitações de proposta definitiva
CREATE TABLE public.solicitacoes_proposta_definitiva (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_inicial_id UUID REFERENCES propostas_assinantes(id),
  
  -- Dados do cliente (confirmados/completados)
  cliente_nome TEXT NOT NULL,
  cliente_email TEXT,
  cliente_telefone TEXT,
  cliente_cpf_cnpj TEXT NOT NULL,
  cliente_endereco TEXT NOT NULL,
  cliente_cep TEXT NOT NULL,
  cliente_cidade TEXT,
  cliente_uf TEXT,
  
  -- Dados da instalação (confirmados)
  numero_instalacao TEXT NOT NULL,
  numero_ucs INTEGER DEFAULT 1,
  tipo_instalacao TEXT NOT NULL,
  consumo_medio_real NUMERIC,
  
  -- Documentos anexados
  documento_identificacao_url TEXT NOT NULL,
  conta_luz_url TEXT NOT NULL,
  contrato_social_url TEXT,
  
  -- Tipo de pessoa
  tipo_pessoa TEXT NOT NULL CHECK (tipo_pessoa IN ('PF', 'PJ')),
  
  -- Controle
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'processada', 'rejeitada')),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.solicitacoes_proposta_definitiva ENABLE ROW LEVEL SECURITY;

-- Permitir inserção anônima (cliente sem login)
CREATE POLICY "Permitir inserção anônima de solicitações"
ON public.solicitacoes_proposta_definitiva FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Permitir leitura para usuários autenticados
CREATE POLICY "Usuários autenticados podem ler solicitações"
ON public.solicitacoes_proposta_definitiva FOR SELECT
TO authenticated
USING (true);

-- Permitir atualização para usuários autenticados
CREATE POLICY "Usuários autenticados podem atualizar solicitações"
ON public.solicitacoes_proposta_definitiva FOR UPDATE
TO authenticated
USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_solicitacoes_updated_at
BEFORE UPDATE ON public.solicitacoes_proposta_definitiva
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();