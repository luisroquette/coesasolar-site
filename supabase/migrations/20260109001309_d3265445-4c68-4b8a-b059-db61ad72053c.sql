-- Adicionar campos para sincronização com ANEEL na tabela concessionarias
ALTER TABLE public.concessionarias
ADD COLUMN IF NOT EXISTS sigla_aneel TEXT,
ADD COLUMN IF NOT EXISTS tusd NUMERIC,
ADD COLUMN IF NOT EXISTS te NUMERIC,
ADD COLUMN IF NOT EXISTS subgrupo TEXT DEFAULT 'B1',
ADD COLUMN IF NOT EXISTS modalidade TEXT DEFAULT 'Convencional',
ADD COLUMN IF NOT EXISTS vigencia_inicio DATE,
ADD COLUMN IF NOT EXISTS ultima_atualizacao TIMESTAMPTZ;

-- Criar índice para busca por sigla ANEEL
CREATE INDEX IF NOT EXISTS idx_concessionarias_sigla_aneel ON public.concessionarias(sigla_aneel);

-- Permitir que usuários autenticados possam atualizar concessionárias (para sync)
CREATE POLICY "Authenticated users can update concessionarias"
ON public.concessionarias
FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Permitir inserção para sync
CREATE POLICY "Authenticated users can insert concessionarias"
ON public.concessionarias
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');