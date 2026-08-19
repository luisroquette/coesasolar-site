-- Tabela para registrar alertas de fraude/tentativas suspeitas
CREATE TABLE public.fraude_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID REFERENCES propostas_assinantes(id),
  cpf_identificacao TEXT,
  cpf_cnpj_conta TEXT,
  tipo_alerta TEXT NOT NULL, -- 'cpf_diferente', 'documento_invalido', 'cnpj_pj_pendente'
  dados_extraidos JSONB,
  ip_cliente TEXT,
  user_agent TEXT,
  resolvido BOOLEAN DEFAULT false,
  resolvido_por TEXT,
  resolvido_em TIMESTAMPTZ,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas frequentes
CREATE INDEX idx_fraude_alertas_proposta ON public.fraude_alertas(proposta_id);
CREATE INDEX idx_fraude_alertas_tipo ON public.fraude_alertas(tipo_alerta);
CREATE INDEX idx_fraude_alertas_created ON public.fraude_alertas(created_at DESC);

-- Habilitar RLS
ALTER TABLE public.fraude_alertas ENABLE ROW LEVEL SECURITY;

-- Política para admins visualizarem todos os alertas
CREATE POLICY "Admins podem ver todos os alertas de fraude"
ON public.fraude_alertas
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

-- Política para inserção (qualquer um pode registrar alerta - público para a página de proposta)
CREATE POLICY "Permitir inserção de alertas de fraude"
ON public.fraude_alertas
FOR INSERT
WITH CHECK (true);

-- Política para admins atualizarem alertas (resolver)
CREATE POLICY "Admins podem atualizar alertas de fraude"
ON public.fraude_alertas
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);