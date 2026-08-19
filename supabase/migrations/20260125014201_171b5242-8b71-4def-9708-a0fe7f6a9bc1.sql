-- Zero Hardcode Phase 6: Completar configurações faltantes
-- Adiciona valores que já são usados nos módulos mas não estavam no banco

-- Economy Simulator: desconto e fidelidade UNLOCK
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('economy_unlock_desconto', '30', 'Desconto percentual do plano UNLOCK (consumo > threshold)'),
  ('economy_unlock_fidelidade', '4', 'Anos de fidelidade do plano UNLOCK')
ON CONFLICT (chave) DO NOTHING;

-- Audio Handler: TTL de cache
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('audio_settings_cache_ttl_ms', '60000', 'TTL do cache de configurações de áudio (ms)')
ON CONFLICT (chave) DO NOTHING;

-- Data Extraction: limites de valores
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('extraction_bill_value_min', '50', 'Valor mínimo de fatura para extração (R$)'),
  ('extraction_bill_value_max', '50000', 'Valor máximo de fatura para extração (R$)'),
  ('extraction_consumption_min', '50', 'Consumo mínimo para extração (kWh)'),
  ('extraction_consumption_max', '100000', 'Consumo máximo para extração (kWh)')
ON CONFLICT (chave) DO NOTHING;

-- TTS: parâmetros de voz ElevenLabs
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('tts_elevenlabs_stability', '0.5', 'Estabilidade da voz ElevenLabs'),
  ('tts_elevenlabs_similarity_boost', '0.75', 'Similarity boost ElevenLabs'),
  ('tts_elevenlabs_style', '0.3', 'Estilo ElevenLabs'),
  ('tts_elevenlabs_speaker_boost', 'true', 'Usar speaker boost ElevenLabs')
ON CONFLICT (chave) DO NOTHING;

-- Audio Handler: tamanho mínimo de texto para TTS
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('audio_min_text_length_tts', '50', 'Tamanho mínimo de texto para geração de áudio TTS')
ON CONFLICT (chave) DO NOTHING;

-- Distribution Typos: TTL de cache
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('distribuidora_cache_ttl_ms', '600000', 'TTL do cache de distribuidoras (10 minutos em ms)')
ON CONFLICT (chave) DO NOTHING;

-- Detection Patterns: TTL de cache
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('detection_pattern_cache_ttl_ms', '600000', 'TTL do cache de padrões de detecção (10 minutos em ms)')
ON CONFLICT (chave) DO NOTHING;

-- Prompt Modules: TTL de cache
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('prompt_module_cache_ttl_ms', '300000', 'TTL do cache de módulos de prompt (5 minutos em ms)')
ON CONFLICT (chave) DO NOTHING;

-- Disqualification Messages: TTL de cache
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('disqualification_cache_ttl_ms', '600000', 'TTL do cache de mensagens de desqualificação (10 minutos em ms)')
ON CONFLICT (chave) DO NOTHING;

-- Billing Education: TTL de disponibilidade
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('billing_disponibilidade_cache_ttl_ms', '300000', 'TTL do cache de disponibilidade para educação de fatura (5 minutos em ms)')
ON CONFLICT (chave) DO NOTHING;