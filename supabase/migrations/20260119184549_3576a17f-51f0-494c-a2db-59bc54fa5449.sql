-- Tabela de blacklist de números
CREATE TABLE public.whatsapp_blacklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telefone TEXT NOT NULL UNIQUE,
  motivo TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT NULL
);

-- Habilitar RLS
ALTER TABLE public.whatsapp_blacklist ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - apenas usuários autenticados podem gerenciar
CREATE POLICY "Authenticated users can view blacklist" 
ON public.whatsapp_blacklist 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert to blacklist" 
ON public.whatsapp_blacklist 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete from blacklist" 
ON public.whatsapp_blacklist 
FOR DELETE 
TO authenticated
USING (true);

-- Service role pode tudo (para edge functions)
CREATE POLICY "Service role full access to blacklist"
ON public.whatsapp_blacklist
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Tabela de tracking de volume diário para warm-up
CREATE TABLE public.whatsapp_daily_volume (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  mensagens_enviadas INTEGER NOT NULL DEFAULT 0,
  limite_do_dia INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(data)
);

-- Habilitar RLS
ALTER TABLE public.whatsapp_daily_volume ENABLE ROW LEVEL SECURITY;

-- Service role pode tudo
CREATE POLICY "Service role full access to daily volume"
ON public.whatsapp_daily_volume
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated pode ver
CREATE POLICY "Authenticated users can view daily volume"
ON public.whatsapp_daily_volume
FOR SELECT
TO authenticated
USING (true);

-- Adicionar campo de cooldown por objeção na tabela de conversas
ALTER TABLE public.chatbot_conversas 
ADD COLUMN IF NOT EXISTS objection_cooldown_until TIMESTAMP WITH TIME ZONE NULL;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_blacklist_telefone ON public.whatsapp_blacklist(telefone);
CREATE INDEX IF NOT EXISTS idx_daily_volume_data ON public.whatsapp_daily_volume(data);
CREATE INDEX IF NOT EXISTS idx_conversas_objection_cooldown ON public.chatbot_conversas(objection_cooldown_until) WHERE objection_cooldown_until IS NOT NULL;