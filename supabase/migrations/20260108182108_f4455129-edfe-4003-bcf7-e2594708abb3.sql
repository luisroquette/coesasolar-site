-- Add public_app_url configuration
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES ('public_app_url', '', 'URL pública do aplicativo para links de propostas (ex: https://seuapp.lovable.app)')
ON CONFLICT (chave) DO NOTHING;