-- Add global audio setting for Sofia
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES ('sofia_audio_enabled', 'true', 'Habilita/desabilita respostas em áudio da sofIA globalmente')
ON CONFLICT (chave) DO NOTHING;