-- Zero Hardcode: Automações e Schedulers
-- Migrar constantes de intervalos, cooldowns e limites de tentativas

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES

-- ===== NUDGE SCHEDULER - Delays =====
('scheduler_nudge_delay_1', '600000', 'Nudge delay 1: 10 minutos em ms'),
('scheduler_nudge_delay_2', '1800000', 'Nudge delay 2: 30 minutos em ms'),
('scheduler_nudge_delay_3', '7200000', 'Nudge delay 3: 2 horas em ms'),
('scheduler_nudge_max_count', '3', 'Número máximo de nudges regulares'),

-- ===== NUDGE SCHEDULER - Contract Delays =====
('scheduler_contract_nudge_delay_1', '7200000', 'Contract nudge delay 1: 2 horas em ms'),
('scheduler_contract_nudge_delay_2', '86400000', 'Contract nudge delay 2: 24 horas em ms'),
('scheduler_contract_nudge_delay_3', '172800000', 'Contract nudge delay 3: 48 horas em ms'),
('scheduler_contract_nudge_max_count', '3', 'Número máximo de contract nudges'),

-- ===== NUDGE SCHEDULER - Document Urgency Delays =====
('scheduler_doc_nudge_delay_1', '300000', 'Doc nudge delay 1: 5 minutos em ms'),
('scheduler_doc_nudge_delay_2', '600000', 'Doc nudge delay 2: 10 minutos em ms'),
('scheduler_doc_nudge_delay_3', '900000', 'Doc nudge delay 3: 15 minutos em ms'),
('scheduler_doc_nudge_delay_4', '1500000', 'Doc nudge delay 4: 25 minutos em ms'),
('scheduler_doc_nudge_delay_5', '3600000', 'Doc nudge delay 5: 1 hora em ms'),
('scheduler_doc_nudge_delay_6', '14400000', 'Doc nudge delay 6: 4 horas em ms'),
('scheduler_doc_nudge_max_count', '6', 'Número máximo de document nudges'),

-- ===== FOLLOWUP SCHEDULER - Intervalos por score =====
('scheduler_followup_high_score_interval', '86400000', 'FUP high score (>=80): 24h em ms'),
('scheduler_followup_medium_high_interval', '172800000', 'FUP medium-high (60-79): 48h em ms'),
('scheduler_followup_medium_interval', '259200000', 'FUP medium (30-59): 72h em ms'),
('scheduler_followup_min_score', '30', 'Score mínimo para enviar follow-up'),

-- ===== MESSAGE RETRY SCHEDULER =====
('scheduler_retry_delay_minutes', '[5, 15, 30, 60, 120]', 'Backoff schedule em minutos (JSON array)'),
('scheduler_retry_max_attempts', '10', 'Máximo de tentativas de retry'),
('scheduler_retry_batch_size', '20', 'Quantidade de mensagens por batch'),
('scheduler_retry_agent_block_reschedule', '1800000', 'Reagendar quando agente bloqueado: 30min em ms'),

-- ===== STUCK LEADS RESCUE SCHEDULER =====
('scheduler_rescue_max_attempts', '7', 'Máximo de tentativas de resgate'),
('scheduler_rescue_delay_1', '30', 'Rescue delay 1: 30 minutos'),
('scheduler_rescue_delay_2', '60', 'Rescue delay 2: 1 hora'),
('scheduler_rescue_delay_3', '120', 'Rescue delay 3: 2 horas'),
('scheduler_rescue_delay_4', '240', 'Rescue delay 4: 4 horas'),
('scheduler_rescue_delay_5', '1440', 'Rescue delay 5: D+1 (24h) em minutos'),
('scheduler_rescue_delay_6', '4320', 'Rescue delay 6: D+3 (72h) em minutos'),
('scheduler_rescue_delay_7', '10080', 'Rescue delay 7: D+7 (168h) em minutos'),
('scheduler_rescue_batch_size', '25', 'Quantidade de leads por batch'),
('scheduler_rescue_inactivity_threshold', '30', 'Minutos de inatividade para considerar travado'),

-- ===== RATE LIMITING =====
('scheduler_rate_limit_base_delay', '500', 'Delay base entre mensagens em ms'),
('scheduler_rate_limit_burst_delay', '2000', 'Delay para burst (>20 msgs) em ms'),

-- ===== PROCESSAMENTO =====
('scheduler_nudge_batch_size', '50', 'Nudge: conversas por batch'),
('scheduler_followup_batch_size', '50', 'Followup: conversas por batch'),
('scheduler_message_delay_between', '500', 'Delay entre mensagens individuais em ms')

ON CONFLICT (chave) DO UPDATE 
SET valor = EXCLUDED.valor,
    descricao = EXCLUDED.descricao,
    updated_at = now();