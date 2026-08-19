-- Add config for fallback failure tracking with threshold
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('elevenlabs_fallback_count', '0', 'Contador de fallbacks consecutivos do ElevenLabs'),
  ('elevenlabs_fallback_window_start', '', 'Timestamp do início da janela de contagem de fallbacks')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;

-- Update existing config descriptions
UPDATE public.configuracoes_sistema 
SET descricao = 'Se true, indica que o ElevenLabs está em modo fallback (usando OpenAI TTS)'
WHERE chave = 'elevenlabs_fallback_active';

UPDATE public.configuracoes_sistema 
SET descricao = 'Timestamp da última ocorrência de fallback do ElevenLabs'
WHERE chave = 'elevenlabs_fallback_at';