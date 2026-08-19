-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 7: ZERO HARDCODE - Final Constants Migration
-- Migrating: UI configs, page constants, edge function params
-- ════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. TIPOS DE INSTALAÇÃO / GD / COMERCIALIZAÇÃO / TRIBUTAÇÃO
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('tipos_instalacao', '["Monofásico", "Bifásico", "Trifásico"]', 'Lista de tipos de instalação elétrica disponíveis'),
  ('tipos_gd', '["GD I", "GD II", "GD III"]', 'Tipos de Geração Distribuída disponíveis'),
  ('tipos_comercializacao', '["Melhores Esforços", "PPA"]', 'Modalidades de comercialização de energia'),
  ('regimes_tributarios', '["SIMPLES", "Lucro Presumido"]', 'Regimes tributários disponíveis para usineiros')
ON CONFLICT (chave) DO UPDATE SET 
  valor = EXCLUDED.valor,
  descricao = EXCLUDED.descricao,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════
-- 2. UI CONFIGS - Pagination, Toast, etc.
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('ui_default_page_size', '20', 'Tamanho padrão de paginação nas listagens'),
  ('ui_toast_limit', '1', 'Número máximo de toasts visíveis simultaneamente'),
  ('ui_toast_remove_delay_ms', '1000000', 'Delay para remover toast automaticamente (ms)'),
  ('ui_activity_log_page_size', '20', 'Tamanho de página para logs de atividade')
ON CONFLICT (chave) DO UPDATE SET 
  valor = EXCLUDED.valor,
  descricao = EXCLUDED.descricao,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════
-- 3. EDGE FUNCTION SPECIFIC CONFIGS
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  -- Bitrix Link Webhook
  ('bitrix_link_cooldown_ms', '60000', 'Cooldown entre envios de link para mesmo lead (ms)'),
  
  -- OneDrive Sync
  ('onedrive_embedding_batch_size', '5', 'Tamanho do batch para gerar embeddings no sync OneDrive'),
  
  -- Message Retry Scheduler  
  ('retry_max_message_length', '4000', 'Comprimento máximo de mensagem no retry scheduler'),
  
  -- Retell Call Webhook
  ('retell_max_call_attempts', '3', 'Máximo de tentativas para chamadas Retell'),
  ('retell_retry_delay_hours', '2', 'Intervalo entre retentativas de chamada (horas)'),
  
  -- Agent Simulator
  ('agent_simulator_max_history_length', '1800', 'Comprimento máximo de mensagem no histórico do simulador'),
  
  -- Pattern imports
  ('pattern_import_batch_size', '100', 'Tamanho do batch para importação de patterns')
ON CONFLICT (chave) DO UPDATE SET 
  valor = EXCLUDED.valor,
  descricao = EXCLUDED.descricao,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════
-- 4. DEMO/SIMULATION VALUES
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('demo_consumo_simulado_kwh', '1500', 'Consumo simulado para demonstrações no editor (kWh)'),
  ('demo_consumo_min_unlock_kwh', '3000', 'Consumo mínimo para habilitar plano UNLOCK no demo')
ON CONFLICT (chave) DO UPDATE SET 
  valor = EXCLUDED.valor,
  descricao = EXCLUDED.descricao,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════
-- 5. ANIMATION/COUNTER CONFIGS
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('stats_counter_steps', '60', 'Número de steps para animação do contador de estatísticas')
ON CONFLICT (chave) DO UPDATE SET 
  valor = EXCLUDED.valor,
  descricao = EXCLUDED.descricao,
  updated_at = now();