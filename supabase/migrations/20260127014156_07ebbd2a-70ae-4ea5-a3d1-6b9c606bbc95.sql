-- ═══════════════════════════════════════════════════════════════════════════
-- CAMADA A: Normalização obrigatória de telefone no banco de dados
-- Garante que mesmo se o código enviar formatos diferentes (12 ou 13 dígitos),
-- o banco sempre salva no formato normalizado: 55 + DDD + 9 + número
-- ═══════════════════════════════════════════════════════════════════════════

-- Função SQL equivalente ao normalizePhoneNumber do TypeScript
CREATE OR REPLACE FUNCTION public.normalize_br_phone(phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized TEXT;
BEGIN
  IF phone IS NULL OR phone = '' THEN
    RETURN phone;
  END IF;
  
  -- Remove tudo que não é dígito
  normalized := regexp_replace(phone, '\D', '', 'g');
  
  -- Remove zero inicial se houver
  IF normalized LIKE '0%' THEN
    normalized := substring(normalized FROM 2);
  END IF;
  
  -- 11 dígitos com 9 na terceira posição: adiciona 55
  IF length(normalized) = 11 AND substring(normalized FROM 3 FOR 1) = '9' THEN
    normalized := '55' || normalized;
  -- 10 dígitos (sem o 9): adiciona 55 + 9 após DDD
  ELSIF length(normalized) = 10 THEN
    normalized := '55' || substring(normalized FROM 1 FOR 2) || '9' || substring(normalized FROM 3);
  -- 12 dígitos começando com 55 mas faltando o 9: insere o 9
  ELSIF length(normalized) = 12 AND normalized LIKE '55%' AND substring(normalized FROM 5 FOR 1) != '9' THEN
    normalized := substring(normalized FROM 1 FOR 4) || '9' || substring(normalized FROM 5);
  END IF;
  
  RETURN normalized;
END;
$$;

-- Trigger para normalizar telefone ANTES de insert/update em chatbot_conversas
CREATE OR REPLACE FUNCTION public.normalize_chatbot_conversa_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Normaliza cliente_telefone
  IF NEW.cliente_telefone IS NOT NULL AND NEW.cliente_telefone != '' THEN
    NEW.cliente_telefone := normalize_br_phone(NEW.cliente_telefone);
  END IF;
  
  -- Garante que whatsapp_provider não fique null (usa 'default' se não informado)
  IF NEW.whatsapp_provider IS NULL OR NEW.whatsapp_provider = '' THEN
    NEW.whatsapp_provider := 'default';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Remove trigger anterior se existir e recria
DROP TRIGGER IF EXISTS trg_normalize_conversa_phone ON chatbot_conversas;

CREATE TRIGGER trg_normalize_conversa_phone
  BEFORE INSERT OR UPDATE ON chatbot_conversas
  FOR EACH ROW
  EXECUTE FUNCTION normalize_chatbot_conversa_phone();

-- ═══════════════════════════════════════════════════════════════════════════
-- CAMADA C: Tabela para Outbound Circuit Breaker
-- Armazena hashes de mensagens enviadas para detectar duplicatas
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.outbound_message_hashes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_normalized TEXT NOT NULL,
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  content_hash TEXT NOT NULL,
  message_preview TEXT, -- primeiros 100 chars para debug
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_count INTEGER NOT NULL DEFAULT 0,
  
  -- Para limpeza automática
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para busca rápida por phone+agent+hash na janela de tempo
CREATE INDEX IF NOT EXISTS idx_outbound_hashes_lookup 
  ON outbound_message_hashes(phone_normalized, agent_id, content_hash, sent_at DESC);

-- Índice para limpeza de registros antigos
CREATE INDEX IF NOT EXISTS idx_outbound_hashes_cleanup 
  ON outbound_message_hashes(created_at);

-- Habilitar RLS
ALTER TABLE public.outbound_message_hashes ENABLE ROW LEVEL SECURITY;

-- Policy: Service role pode tudo (edge functions)
CREATE POLICY "Service role full access on outbound_message_hashes"
  ON public.outbound_message_hashes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- CAMADA F: Inserir configurações dinâmicas do circuit breaker
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('outbound_dedupe_window_ms', '90000', 'Janela em ms para detectar mensagens duplicadas de saída (default: 90s)'),
  ('outbound_dedupe_max_hits', '2', 'Número máximo de hits antes de pausar conversa automaticamente'),
  ('outbound_circuit_breaker_enabled', 'true', 'Habilita o circuit breaker de saída'),
  ('outbound_circuit_breaker_pause', 'true', 'Se true, pausa conversa após max_hits (modo humano)'),
  ('batch_window_ms', '3000', 'Janela de batching para agrupar mensagens rápidas (default: 3s)')
ON CONFLICT (chave) DO UPDATE SET 
  valor = EXCLUDED.valor,
  descricao = EXCLUDED.descricao,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════════
-- Função para limpeza periódica de hashes antigos (executar via cron)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cleanup_old_outbound_hashes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Remove hashes com mais de 1 hora (bem além da janela de dedup)
  DELETE FROM outbound_message_hashes
  WHERE created_at < now() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;