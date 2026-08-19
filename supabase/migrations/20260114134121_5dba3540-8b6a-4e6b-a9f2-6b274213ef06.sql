-- Inserir novas configurações de capacidades da sofIA
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('sofia_leitura_imagens_enabled', 'true', 'Habilita análise de imagens pela sofIA'),
('sofia_leitura_pdfs_enabled', 'true', 'Habilita análise de PDFs pela sofIA'),
('sofia_transcricao_audio_enabled', 'true', 'Habilita transcrição de áudios pela sofIA'),
('sofia_gerar_propostas_enabled', 'true', 'Habilita geração automática de propostas pela sofIA'),
('sofia_enviar_links_enabled', 'true', 'Habilita envio automático de links de proposta'),
('sofia_modo_closer_enabled', 'true', 'Habilita modo Closer Premium da sofIA'),
('sofia_followups_enabled', 'true', 'Habilita follow-ups e nudges automáticos')
ON CONFLICT (chave) DO NOTHING;