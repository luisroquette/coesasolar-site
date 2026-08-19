-- Adicionar configurações para rastrear fallback do ElevenLabs
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('elevenlabs_fallback_active', 'false', 'Indica se o ElevenLabs está em fallback (sem créditos)'),
('elevenlabs_fallback_at', '', 'Data/hora do último fallback do ElevenLabs')
ON CONFLICT (chave) DO NOTHING;