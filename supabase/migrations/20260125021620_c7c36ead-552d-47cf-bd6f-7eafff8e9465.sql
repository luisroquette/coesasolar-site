-- ══════════════════════════════════════════════════════════════════════════════
-- FASE 14: Zero Hardcode 100% - Imagens, Redes Sociais, Limites Finais
-- ══════════════════════════════════════════════════════════════════════════════

-- URLs de imagens de background (Unsplash → configuráveis)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('home_bg_about', 'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80', 'URL da imagem de fundo da seção Sobre'),
('home_bg_how_it_works', 'https://images.unsplash.com/photo-1558449028-b53a39d100fc?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80', 'URL da imagem de fundo da seção Como Funciona'),
('home_bg_cta', 'https://images.unsplash.com/photo-1497440001374-f26997328c1b?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80', 'URL da imagem de fundo da seção CTA'),
('home_bg_why_choose', 'https://images.unsplash.com/photo-1509391366360-2e959784a276?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80', 'URL da imagem de fundo da seção Por Que Escolher')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Limites de métricas finais
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('query_limit_nudge_messages', '500', 'Limite de mensagens de nudge para métricas'),
('query_limit_nudge_conversas', '500', 'Limite de conversas de nudge para métricas'),
('query_limit_doc_metrics_conversas', '500', 'Limite de conversas para métricas de documentos'),
('query_limit_doc_metrics_solicitacoes', '500', 'Limite de solicitações para métricas de documentos'),
('query_limit_doc_metrics_propostas', '500', 'Limite de propostas para métricas de documentos'),
('query_limit_pattern_versions', '50', 'Limite de versões de padrões exibidas'),
('query_limit_outbound_queue', '50', 'Limite de itens na fila de chamadas outbound'),
('query_limit_admin_notifications', '20', 'Limite de notificações admin'),
('query_limit_rag_quality_alerts', '20', 'Limite de alertas de qualidade RAG')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();