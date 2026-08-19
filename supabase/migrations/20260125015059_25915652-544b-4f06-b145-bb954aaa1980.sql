-- ══════════════════════════════════════════════════════════════════════════════
-- FASE 8: Zero Hardcode - UI/UX Constants, RAG Categories, Years, Toast Settings
-- ══════════════════════════════════════════════════════════════════════════════

-- UI Toast Settings
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('ui_toast_limit', '1', 'Número máximo de toasts visíveis simultaneamente'),
('ui_toast_remove_delay_ms', '1000000', 'Delay em ms para remover toast automaticamente'),
('ui_copy_feedback_delay_ms', '2000', 'Delay em ms para feedback visual de "copiado"'),
('ui_refresh_feedback_delay_ms', '500', 'Delay em ms para feedback de refresh')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- RAG Categories (dinâmico em vez de hardcoded no componente)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('rag_categories', '["vendas", "sac", "cobranca", "geral", "treinamento", "regulatorio"]', 'Categorias disponíveis para RAG'),
('rag_category_labels', '{"vendas": "🛒 Vendas", "sac": "🎧 SAC", "cobranca": "💰 Cobrança", "geral": "📚 Geral", "treinamento": "🎓 Treinamento", "regulatorio": "⚖️ Regulatório"}', 'Labels com emojis para categorias RAG')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- File Upload Limits
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('upload_max_size_default_mb', '10', 'Tamanho máximo padrão de upload em MB'),
('upload_max_size_contract_mb', '15', 'Tamanho máximo para contratos em MB'),
('upload_allowed_types', '["application/pdf", "image/jpeg", "image/jpg", "image/png"]', 'Tipos de arquivo permitidos para upload')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Years for Selectors (dinâmico)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('ui_available_years', '[2024, 2025, 2026, 2027, 2028]', 'Anos disponíveis nos seletores de data')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Nudge Response Estimates (para métricas)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('metrics_nudge1_response_rate', '0.50', 'Estimativa de resposta após 1º nudge (50%)'),
('metrics_nudge2_response_rate', '0.35', 'Estimativa de resposta após 2º nudge (35%)'),
('metrics_nudge3_response_rate', '0.15', 'Estimativa de resposta após 3º nudge (15%)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Lead Alert Thresholds
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('crm_lead_alert_min_age_hours', '1', 'Idade mínima em horas para alertar sobre leads sem proposta'),
('crm_sofia_origins', '["whatsapp_sofia", "bitrix24_webhook"]', 'Origens que identificam leads da Sofia')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Trend Calculation Thresholds
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('metrics_trend_threshold', '5', 'Limite de score para considerar crescimento/queda')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- A4 Dimensions (para editor de propostas)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('pdf_a4_width_px', '794', 'Largura A4 em pixels (96 DPI, 210mm)'),
('pdf_a4_height_px', '1123', 'Altura A4 em pixels (96 DPI, 297mm)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Pagination Defaults
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('ui_activity_log_page_size', '20', 'Itens por página no log de atividades'),
('ui_agents_table_page_size', '10', 'Itens por página na tabela de agentes'),
('ui_rag_scripts_limit', '100', 'Limite de scripts premium a buscar')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();