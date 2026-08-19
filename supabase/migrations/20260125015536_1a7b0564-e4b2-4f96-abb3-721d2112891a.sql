-- ══════════════════════════════════════════════════════════════════════════════
-- FASE 9: Zero Hardcode - Final Constants Migration
-- ══════════════════════════════════════════════════════════════════════════════

-- Agent Simulator Constants
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('simulator_max_history_msg_length', '1800', 'Tamanho máximo de mensagem no histórico do simulador'),
('simulator_batch_size', '100', 'Tamanho do lote para inserções no simulador')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- RAG Search Defaults
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('rag_default_top_k', '5', 'Número padrão de resultados a retornar no RAG'),
('rag_default_min_similarity', '0.35', 'Similaridade mínima padrão para busca RAG')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Proposal Editor Constants
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('editor_consumo_simulado_kwh', '1500', 'Consumo simulado para preview no editor de propostas'),
('editor_consumo_min_unlock_kwh', '3000', 'Consumo mínimo para habilitar plano UNLOCK no preview'),
('editor_default_plans', '[{"pct": 15, "nome": "Start", "anos": 1, "unlock": false}, {"pct": 20, "nome": "Economia", "anos": 2, "unlock": false}, {"pct": 25, "nome": "Premium", "anos": 3, "unlock": false}, {"pct": 30, "nome": "UNLOCK", "anos": 4, "unlock": true}]', 'Planos padrão para preview no editor')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Table Pagination Defaults
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('ui_agents_table_items_per_page', '10', 'Itens por página na tabela de agentes'),
('ui_default_preview_limit', '5', 'Limite padrão de itens em previews'),
('ui_notifications_max_display', '20', 'Máximo de notificações a exibir'),
('ui_escalations_display_limit', '10', 'Limite de escalações a exibir')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Stats Counter Defaults
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('ui_stats_counter_steps', '60', 'Número de passos na animação do contador'),
('ui_stats_counter_duration_ms', '2000', 'Duração da animação do contador em ms')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Import Batch Sizes
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('import_patterns_batch_size', '100', 'Tamanho do lote para importação de patterns'),
('import_preview_limit', '20', 'Limite de itens para preview na importação')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();