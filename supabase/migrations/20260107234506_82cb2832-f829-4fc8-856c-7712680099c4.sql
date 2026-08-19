-- Tabela de metas por funcionário
CREATE TABLE public.employee_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL CHECK (year >= 2024),
    propostas_meta INTEGER DEFAULT 10,
    valor_meta NUMERIC DEFAULT 50000,
    conversao_meta NUMERIC DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE (user_id, month, year)
);

-- Índices
CREATE INDEX idx_goals_user ON public.employee_goals(user_id);
CREATE INDEX idx_goals_period ON public.employee_goals(year, month);

-- Habilitar RLS
ALTER TABLE public.employee_goals ENABLE ROW LEVEL SECURITY;

-- Política: Admins podem ver todas as metas
CREATE POLICY "Admins can view all goals"
ON public.employee_goals FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Política: Usuários podem ver suas próprias metas
CREATE POLICY "Users can view own goals"
ON public.employee_goals FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Política: Admins podem inserir metas
CREATE POLICY "Admins can insert goals"
ON public.employee_goals FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- Política: Admins podem atualizar metas
CREATE POLICY "Admins can update goals"
ON public.employee_goals FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Política: Admins podem deletar metas
CREATE POLICY "Admins can delete goals"
ON public.employee_goals FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_employee_goals_updated_at
BEFORE UPDATE ON public.employee_goals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();