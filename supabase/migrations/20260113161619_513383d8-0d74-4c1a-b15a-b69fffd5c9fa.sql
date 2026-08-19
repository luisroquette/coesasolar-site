-- Inserir chave de cache-busting para propostas públicas
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES ('public_cache_bust', '1736784000000', 'Versão do cache para propostas públicas. Atualizar para forçar refresh.')
ON CONFLICT (chave) DO NOTHING;