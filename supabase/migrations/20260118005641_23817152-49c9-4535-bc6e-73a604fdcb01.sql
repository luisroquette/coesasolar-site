-- Adicionar coluna para configurações de voz por modo (inbound/outbound)
-- Estrutura: { inbound: {...}, outbound: {...} }
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS voice_config JSONB DEFAULT '{
  "inbound": {
    "enabled": false,
    "provider": "retell",
    "agent_id": null,
    "from_number": null,
    "webhook_url": null,
    "kb_mode": "shared",
    "custom_kb_sources": [],
    "settings": {
      "language": "pt-BR",
      "voice_id": null,
      "response_delay_ms": 0,
      "end_call_after_silence_ms": 5000,
      "max_call_duration_seconds": 600
    },
    "secrets": {
      "api_key_ref": null
    }
  },
  "outbound": {
    "enabled": false,
    "provider": "retell",
    "agent_id": null,
    "from_number": null,
    "webhook_url": null,
    "kb_mode": "shared",
    "custom_kb_sources": [],
    "settings": {
      "language": "pt-BR",
      "voice_id": null,
      "response_delay_ms": 0,
      "max_call_duration_seconds": 300,
      "greeting_template": "Olá {{customer_name}}, aqui é a {{agent_name}} da COESA Energia."
    },
    "campaign_settings": {
      "max_attempts": 3,
      "retry_delay_hours": 24,
      "calling_hours_start": "09:00",
      "calling_hours_end": "18:00",
      "calling_days": ["mon", "tue", "wed", "thu", "fri"]
    },
    "secrets": {
      "api_key_ref": null
    }
  }
}'::jsonb;

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.ai_agents.voice_config IS 'Configurações de voz para modos inbound e outbound, incluindo IDs de agentes externos, webhooks e secrets';

-- Criar tabela para armazenar secrets de agentes (referências seguras)
CREATE TABLE IF NOT EXISTS public.agent_secrets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  secret_name TEXT NOT NULL,
  secret_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('inbound', 'outbound', 'shared')),
  description TEXT,
  is_configured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agent_id, secret_name, mode)
);

-- Enable RLS
ALTER TABLE public.agent_secrets ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view agent secrets metadata"
  ON public.agent_secrets
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage agent secrets"
  ON public.agent_secrets
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Index para busca por agente
CREATE INDEX IF NOT EXISTS idx_agent_secrets_agent_id ON public.agent_secrets(agent_id);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_agent_secrets_updated_at
  BEFORE UPDATE ON public.agent_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();