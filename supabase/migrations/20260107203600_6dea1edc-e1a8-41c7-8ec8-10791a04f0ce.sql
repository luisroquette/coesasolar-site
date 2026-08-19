-- Tabela de perfis de usuários
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  email TEXT,
  cargo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Tabela de cidades com índices solarimétricos
CREATE TABLE public.cidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cidade TEXT NOT NULL,
  uf TEXT NOT NULL,
  indice_solarimetrico DECIMAL(10,4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cidades são públicas para leitura" ON public.cidades FOR SELECT USING (true);

-- Tabela de concessionárias
CREATE TABLE public.concessionarias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  uf TEXT,
  tarifa_media DECIMAL(10,4),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.concessionarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Concessionárias são públicas para leitura" ON public.concessionarias FOR SELECT USING (true);

-- Tabela de parâmetros macroeconômicos
CREATE TABLE public.parametros_macro (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ano INTEGER NOT NULL,
  ipca DECIMAL(10,4),
  cdi DECIMAL(10,4),
  igpm DECIMAL(10,4),
  inflacao_energetica DECIMAL(10,4),
  fio_b DECIMAL(10,4),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.parametros_macro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parâmetros são públicos para leitura" ON public.parametros_macro FOR SELECT USING (true);
CREATE POLICY "Usuários autenticados podem editar parâmetros" ON public.parametros_macro FOR ALL USING (auth.uid() IS NOT NULL);

-- Tabela de propostas para assinantes
CREATE TABLE public.propostas_assinantes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Dados do cliente
  cliente_nome TEXT NOT NULL,
  cliente_cpf_cnpj TEXT,
  cliente_endereco TEXT,
  cliente_cidade TEXT,
  cliente_uf TEXT,
  cliente_cep TEXT,
  cliente_telefone TEXT,
  cliente_email TEXT,
  
  -- Dados da instalação
  concessionaria TEXT,
  numero_ucs INTEGER DEFAULT 1,
  numero_instalacao TEXT,
  tipo_instalacao TEXT DEFAULT 'Monofásico',
  
  -- Dados de consumo
  tarifa DECIMAL(10,4),
  cip DECIMAL(10,2),
  consumo_medio DECIMAL(10,2),
  
  -- Condições comerciais
  fidelidade_anos INTEGER DEFAULT 5,
  desconto_percentual DECIMAL(5,2) DEFAULT 15,
  responsavel_comercial TEXT,
  
  -- Resultados calculados
  economia_mensal DECIMAL(10,2),
  economia_anual DECIMAL(10,2),
  economia_acumulada DECIMAL(12,2),
  
  -- Status
  status TEXT DEFAULT 'rascunho',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.propostas_assinantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own proposals" ON public.propostas_assinantes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own proposals" ON public.propostas_assinantes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own proposals" ON public.propostas_assinantes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own proposals" ON public.propostas_assinantes FOR DELETE USING (auth.uid() = user_id);

-- Tabela de propostas para usineiros
CREATE TABLE public.propostas_usineiros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Dados do projeto
  nome_projeto TEXT NOT NULL,
  spe TEXT,
  cidade TEXT,
  uf TEXT,
  tipo_gd TEXT DEFAULT 'GD II',
  
  -- Capacidade
  potencia_mwp DECIMAL(10,4),
  oversizing DECIMAL(5,2) DEFAULT 1.2,
  quantidade_modulos INTEGER,
  area_hectares DECIMAL(10,4),
  
  -- Comercialização
  concessionaria TEXT,
  tipo_comercializacao TEXT DEFAULT 'Melhores Esforços',
  taxa_administracao DECIMAL(5,2) DEFAULT 8,
  desconto_cliente_final DECIMAL(5,2) DEFAULT 15,
  
  -- Custos
  capex_total DECIMAL(14,2),
  capex_por_wp DECIMAL(10,4),
  om_percentual DECIMAL(5,2) DEFAULT 1,
  arrendamento_mensal DECIMAL(10,2),
  seguro_anual DECIMAL(10,2),
  contabilidade_mensal DECIMAL(10,2),
  
  -- Financiamento
  financiamento_valor DECIMAL(14,2),
  financiamento_carencia_meses INTEGER,
  financiamento_prazo_meses INTEGER,
  financiamento_tipo_taxa TEXT,
  financiamento_taxa DECIMAL(5,2),
  
  -- Regime tributário
  regime_tributario TEXT DEFAULT 'Lucro Presumido',
  
  -- Resultados calculados
  geracao_mensal_mwh DECIMAL(12,4),
  receita_bruta_anual DECIMAL(14,2),
  ebitda_anual DECIMAL(14,2),
  tir DECIMAL(8,4),
  vpl DECIMAL(14,2),
  payback_anos DECIMAL(5,2),
  
  -- Status
  status TEXT DEFAULT 'rascunho',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.propostas_usineiros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own proposals" ON public.propostas_usineiros FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own proposals" ON public.propostas_usineiros FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own proposals" ON public.propostas_usineiros FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own proposals" ON public.propostas_usineiros FOR DELETE USING (auth.uid() = user_id);

-- Tabela de fluxo de caixa (In.Cash Flow)
CREATE TABLE public.fluxo_caixa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposta_usineiro_id UUID NOT NULL REFERENCES public.propostas_usineiros(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  
  -- Receitas
  geracao_mwh DECIMAL(12,4),
  receita_bruta DECIMAL(14,2),
  receita_liquida DECIMAL(14,2),
  
  -- Custos
  om DECIMAL(12,2),
  arrendamento DECIMAL(12,2),
  seguro DECIMAL(12,2),
  contabilidade DECIMAL(12,2),
  parcela_financiamento DECIMAL(12,2),
  
  -- Impostos
  pis_cofins DECIMAL(12,2),
  irpj_csll DECIMAL(12,2),
  
  -- Resultados
  ebitda DECIMAL(14,2),
  lucro_liquido DECIMAL(14,2),
  fluxo_caixa_livre DECIMAL(14,2),
  fluxo_caixa_descontado DECIMAL(14,2),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fluxo_caixa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cash flow through proposal" ON public.fluxo_caixa 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.propostas_usineiros 
      WHERE id = proposta_usineiro_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert cash flow through proposal" ON public.fluxo_caixa 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.propostas_usineiros 
      WHERE id = proposta_usineiro_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete cash flow through proposal" ON public.fluxo_caixa 
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.propostas_usineiros 
      WHERE id = proposta_usineiro_id AND user_id = auth.uid()
    )
  );

-- Função para atualizar timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Triggers para atualizar timestamps
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_parametros_macro_updated_at BEFORE UPDATE ON public.parametros_macro FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_propostas_assinantes_updated_at BEFORE UPDATE ON public.propostas_assinantes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_propostas_usineiros_updated_at BEFORE UPDATE ON public.propostas_usineiros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para criar perfil automaticamente ao criar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();