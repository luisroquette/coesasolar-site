-- Criar tabela para dados de empresas PJ
CREATE TABLE public.dados_empresa_pj (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID REFERENCES public.propostas_assinantes(id) ON DELETE CASCADE,
  
  -- Dados da Empresa
  razao_social TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  nire TEXT,
  inscricao_estadual TEXT,
  natureza_juridica TEXT,
  objeto_social TEXT,
  data_constituicao DATE,
  
  -- Sede da Empresa
  sede_logradouro TEXT,
  sede_numero TEXT,
  sede_complemento TEXT,
  sede_bairro TEXT,
  sede_cidade TEXT,
  sede_uf TEXT,
  sede_cep TEXT,
  
  -- Sócio Administrador (quem assina pela empresa)
  admin_nome_completo TEXT NOT NULL,
  admin_cpf TEXT NOT NULL,
  admin_rg TEXT,
  admin_rg_orgao TEXT,
  admin_data_nascimento DATE,
  admin_estado_civil TEXT,
  admin_profissao TEXT,
  admin_nacionalidade TEXT,
  admin_endereco TEXT,
  admin_cidade TEXT,
  admin_uf TEXT,
  admin_cep TEXT,
  
  -- Quadro Societário (JSON array com todos os sócios)
  quadro_societario JSONB DEFAULT '[]'::jsonb,
  
  -- URL do documento do contrato social
  contrato_social_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Adicionar coluna na propostas_assinantes para referenciar dados PJ
ALTER TABLE public.propostas_assinantes 
ADD COLUMN IF NOT EXISTS dados_pj_id UUID REFERENCES public.dados_empresa_pj(id);

-- Habilitar RLS
ALTER TABLE public.dados_empresa_pj ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para dados_empresa_pj
CREATE POLICY "Users can view PJ data through proposal"
ON public.dados_empresa_pj
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.propostas_assinantes
    WHERE propostas_assinantes.id = dados_empresa_pj.proposta_id
    AND propostas_assinantes.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert PJ data through proposal"
ON public.dados_empresa_pj
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.propostas_assinantes
    WHERE propostas_assinantes.id = dados_empresa_pj.proposta_id
    AND propostas_assinantes.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update PJ data through proposal"
ON public.dados_empresa_pj
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.propostas_assinantes
    WHERE propostas_assinantes.id = dados_empresa_pj.proposta_id
    AND propostas_assinantes.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete PJ data through proposal"
ON public.dados_empresa_pj
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.propostas_assinantes
    WHERE propostas_assinantes.id = dados_empresa_pj.proposta_id
    AND propostas_assinantes.user_id = auth.uid()
  )
);

-- Política pública para inserção via formulário público (igual solicitações)
CREATE POLICY "Public can insert PJ data for proposals"
ON public.dados_empresa_pj
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can view PJ data for proposals"
ON public.dados_empresa_pj
FOR SELECT
USING (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_dados_empresa_pj_updated_at
BEFORE UPDATE ON public.dados_empresa_pj
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();