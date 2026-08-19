-- ════════════════════════════════════════════════════════════════
-- ANTI-SPAM: Adicionar message_id para deduplicação por mensagem
-- ════════════════════════════════════════════════════════════════

-- 1. Adicionar coluna message_id para rastrear mensagens específicas
ALTER TABLE public.unanswered_detection_attempts 
ADD COLUMN IF NOT EXISTS message_id TEXT;

-- 2. Criar índice único para evitar processar a mesma mensagem duas vezes
CREATE UNIQUE INDEX IF NOT EXISTS idx_unanswered_detection_unique_message 
ON public.unanswered_detection_attempts (conversa_id, message_id) 
WHERE message_id IS NOT NULL;

-- 3. Criar índice para busca por resultado (para contagem de fallbacks por dia)
CREATE INDEX IF NOT EXISTS idx_unanswered_detection_result_date 
ON public.unanswered_detection_attempts (conversa_id, result, created_at DESC);

-- 4. Atualizar configuração de cooldown para 60 minutos
UPDATE public.configuracoes_sistema 
SET valor = '60', updated_at = now()
WHERE chave = 'unanswered_cooldown_minutes';

-- 5. Se não existir, criar a configuração
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES ('unanswered_cooldown_minutes', '60', 'Cooldown em minutos entre tentativas de detecção na mesma conversa (anti-spam)')
ON CONFLICT (chave) DO UPDATE SET valor = '60', updated_at = now();