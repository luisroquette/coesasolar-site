-- ══════════════════════════════════════════════════════════════════════════════
-- FASE 12: Zero Hardcode - URLs externas, WhatsApp, YouTube e Hero Stats
-- ══════════════════════════════════════════════════════════════════════════════

-- WhatsApp Support (para página pública)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('whatsapp_suporte_numero', '5531999999999', 'Número WhatsApp para suporte na página pública'),
('whatsapp_suporte_mensagem', 'Olá! Preciso de ajuda com a validação dos meus documentos para a proposta de energia solar.', 'Mensagem padrão para WhatsApp de suporte')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- YouTube/Hero Video
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('hero_video_youtube_id', 'ftw1xfJQ5jM', 'ID do vídeo YouTube para background do Hero'),
('hero_video_origin', 'https://coesa-propose-craft.lovable.app', 'Origin para embed do YouTube')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Hero Section Stats (JSON array)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('hero_stats', '[{"icon":"Zap","value":"30%","label":"Economia"},{"icon":"Leaf","value":"100%","label":"Energia Limpa"},{"icon":"Shield","value":"5 anos","label":"Garantia"},{"icon":"Clock","value":"0","label":"Investimento"}]', 'Estatísticas exibidas no Hero da landing page')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Sidebar settings
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('sidebar_width', '16rem', 'Largura padrão da sidebar'),
('sidebar_width_mobile', '18rem', 'Largura da sidebar em mobile'),
('sidebar_width_icon', '3rem', 'Largura da sidebar quando colapsada'),
('sidebar_cookie_max_age', '604800', 'Tempo de vida do cookie da sidebar (segundos)'),
('sidebar_keyboard_shortcut', 'b', 'Tecla de atalho para toggle da sidebar')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();