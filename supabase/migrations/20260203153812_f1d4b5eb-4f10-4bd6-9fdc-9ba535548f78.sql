-- Tabela de bloqueio absoluto por takeover humano (por telefone)
CREATE TABLE IF NOT EXISTS public.human_takeovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  whatsapp_provider TEXT NOT NULL DEFAULT 'zapi',
  phone_normalized TEXT NOT NULL,

  taken_over_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  taken_over_by_phone TEXT NULL,
  taken_over_by_name TEXT NULL,

  resolved_at TIMESTAMPTZ NULL,
  resolved_by_phone TEXT NULL,
  resolved_by_name TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unicidade: um takeover ativo por (agente, provedor, telefone)
CREATE UNIQUE INDEX IF NOT EXISTS human_takeovers_active_unique
ON public.human_takeovers (agent_id, whatsapp_provider, phone_normalized)
WHERE resolved_at IS NULL;

-- Índice de lookup rápido
CREATE INDEX IF NOT EXISTS human_takeovers_lookup_idx
ON public.human_takeovers (phone_normalized, agent_id, whatsapp_provider);

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_human_takeovers_updated_at ON public.human_takeovers;
CREATE TRIGGER update_human_takeovers_updated_at
BEFORE UPDATE ON public.human_takeovers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Segurança: bloquear acesso direto do cliente; o backend (service role) continua operando
ALTER TABLE public.human_takeovers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.human_takeovers FROM anon;
REVOKE ALL ON TABLE public.human_takeovers FROM authenticated;
