-- Adicionar colunas de detecção de objeção
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS detected_objection TEXT;
-- Valores: 'PRECO', 'CONFIANCA', 'CONTRATO', 'TEMPO', 'COMPLEXIDADE', 'AUTORIDADE'

-- A/B Testing
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS ab_variant TEXT DEFAULT 'A';

-- Eventos de funil
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS event_simulation BOOLEAN DEFAULT FALSE;
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS event_proposal_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS event_objection_detected BOOLEAN DEFAULT FALSE;
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS event_drop BOOLEAN DEFAULT FALSE;
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS event_conversion BOOLEAN DEFAULT FALSE;

-- Follow-up timing
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE chatbot_conversas ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0;

-- Índices para analytics
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_detected_objection ON chatbot_conversas(detected_objection);
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_ab_variant ON chatbot_conversas(ab_variant);
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_event_conversion ON chatbot_conversas(event_conversion);
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_next_followup ON chatbot_conversas(next_followup_at) WHERE next_followup_at IS NOT NULL;