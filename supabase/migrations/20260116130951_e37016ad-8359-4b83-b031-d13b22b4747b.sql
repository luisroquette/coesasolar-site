-- ═══════════════════════════════════════════════════════════════════════════
-- QUIET HOURS CONFIGURATION
-- Período de silêncio das 20:00 às 07:00 para FUPs automáticos
-- A Sofia responde normalmente quando provocada pelo cliente
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
  ('quiet_hours_enabled', 'true', 'Ativar período de silêncio para FUPs automáticos'),
  ('quiet_hours_start', '20:00', 'Horário de início do período de silêncio (formato HH:mm)'),
  ('quiet_hours_end', '07:00', 'Horário de fim do período de silêncio (formato HH:mm)'),
  ('quiet_hours_timezone', 'America/Sao_Paulo', 'Fuso horário para cálculo do período de silêncio')
ON CONFLICT (chave) DO UPDATE SET 
  valor = EXCLUDED.valor,
  descricao = EXCLUDED.descricao,
  updated_at = now();