-- ══════════════════════════════════════════════════════════════════════════════
-- FASE 11: Zero Hardcode - Query Limits, Analytics & Remaining Hardcoded Values
-- ══════════════════════════════════════════════════════════════════════════════

-- Query limits for various components
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('query_limit_conversas', '100', 'Limite de conversas por query (ChatbotAnalytics, etc)'),
('query_limit_bandeiras', '24', 'Limite de bandeiras tarifárias a exibir'),
('query_limit_warmup_days', '7', 'Dias de histórico para warm-up anti-spam'),
('query_limit_pending_leads', '50', 'Limite de leads pendentes a exibir'),
('query_limit_webhook_events', '50', 'Limite de eventos de webhook a exibir'),
('query_limit_rag_alerts', '20', 'Limite de alertas RAG a exibir'),
('query_limit_rag_chunks', '50', 'Limite de chunks na busca RAG'),
('query_limit_delivery_failures', '50', 'Limite de falhas de entrega a exibir')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Analytics display limits
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('analytics_top_questions_limit', '20', 'Limite de perguntas mais frequentes a exibir'),
('analytics_version_changes_limit', '4', 'Limite de mudanças de versão a exibir por item')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Polling fallback interval  
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('polling_fallback_interval_ms', '30000', 'Intervalo de polling fallback quando realtime desconecta')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- PDF generation constants
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('pdf_cover_y_start', '140', 'Posição Y inicial da capa do PDF'),
('pdf_fluxo_caixa_years', '25', 'Anos do fluxo de caixa a exibir no PDF')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Document types array
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('upload_document_types', '["conta_energia","identidade","contrato_social","procuracao"]', 'Tipos de documentos aceitos para upload')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();