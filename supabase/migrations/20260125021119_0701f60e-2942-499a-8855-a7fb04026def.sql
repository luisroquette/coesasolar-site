-- ══════════════════════════════════════════════════════════════════════════════
-- FASE 13: Zero Hardcode - ICMS fallback, GD2 cronograma, Bandeiras, Polling
-- ══════════════════════════════════════════════════════════════════════════════

-- ICMS fallback por estado (JSON object)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('calc_icms_fallback_estados', '{"AC":0.17,"AL":0.18,"AP":0.17,"AM":0.18,"BA":0.18,"CE":0.18,"DF":0.18,"ES":0.17,"GO":0.17,"MA":0.22,"MT":0.17,"MS":0.17,"MG":0.18,"PA":0.17,"PB":0.18,"PR":0.18,"PE":0.18,"PI":0.18,"RJ":0.18,"RN":0.18,"RS":0.30,"RO":0.175,"RR":0.17,"SC":0.25,"SP":0.18,"SE":0.18,"TO":0.18}', 'ICMS fallback por estado quando não encontrado no banco (JSON)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- ICMS fallback padrão
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('calc_icms_fallback_default', '0.18', 'ICMS fallback padrão quando estado não encontrado')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Cronograma GD2 (Lei 14.300) - JSON object
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('calc_cronograma_gd2', '{"2023":0.15,"2024":0.30,"2025":0.45,"2026":0.60,"2027":0.75,"2028":0.90,"2029":1.00}', 'Percentuais GD2 por ano (Lei 14.300, art. 27)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Bandeiras tarifárias fallback - valores em R$/kWh
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('calc_bandeiras_valores', '{"verde":0,"amarela":0.01885,"vermelha1":0.04463,"vermelha2":0.07877}', 'Valores das bandeiras tarifárias R$/kWh (fallback)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Fator de simultaneidade por perfil (JSON object)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('calc_fator_simultaneidade', '{"residencial":{"min":0.20,"max":0.40,"default":0.30},"comercial_diurno":{"min":0.50,"max":0.70,"default":0.60},"industrial":{"min":0.70,"max":0.85,"default":0.75},"agro_bombeamento":{"min":0.30,"max":0.60,"default":0.45}}', 'Fatores de simultaneidade por perfil de consumo')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Intervalos de polling adicionais (ms)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('interval_nudge_metrics_ms', '60000', 'Intervalo de atualização das métricas de nudge (ms)'),
('interval_webhook_diagnostics_ms', '10000', 'Intervalo de atualização do diagnóstico de webhook (ms)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Limites de query adicionais
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('query_limit_bitrix_logs', '20', 'Limite de logs do Bitrix24 por lead'),
('query_limit_delivery_failures', '50', 'Limite de falhas de entrega exibidas'),
('query_limit_cidades_autocomplete', '20', 'Limite de cidades no autocomplete')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();