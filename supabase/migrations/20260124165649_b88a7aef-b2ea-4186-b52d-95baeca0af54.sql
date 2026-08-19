-- =====================================================
-- MIGRAÇÃO ZERO HARDCODE - FASE FINAL (CORRIGIDA)
-- Inserir todos os valores residuais no banco de dados
-- =====================================================

-- =====================================================
-- 1. RATE LIMITER CONFIG
-- =====================================================
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
-- Default config
('rate_limit_base_delay_ms', '3000', 'Delay base entre mensagens (ms)'),
('rate_limit_max_delay_ms', '10000', 'Delay máximo entre mensagens (ms)'),
('rate_limit_jitter_ms', '2000', 'Variação aleatória no delay (ms)'),
('rate_limit_max_per_minute', '15', 'Limite máximo de mensagens por minuto'),
('rate_limit_batch_penalty_ms', '500', 'Penalidade adicional para batches grandes (ms)'),
('rate_limit_batch_threshold', '10', 'Threshold para aplicar penalidade de batch'),
-- Normal config
('rate_limit_normal_base_delay_ms', '2000', 'Config normal - delay base (ms)'),
('rate_limit_normal_max_delay_ms', '6000', 'Config normal - delay máximo (ms)'),
('rate_limit_normal_jitter_ms', '1500', 'Config normal - jitter (ms)'),
('rate_limit_normal_max_per_minute', '20', 'Config normal - limite por minuto'),
-- Recovery config
('rate_limit_recovery_base_delay_ms', '5000', 'Config recovery - delay base (ms)'),
('rate_limit_recovery_max_delay_ms', '15000', 'Config recovery - delay máximo (ms)'),
('rate_limit_recovery_jitter_ms', '3000', 'Config recovery - jitter (ms)'),
('rate_limit_recovery_max_per_minute', '10', 'Config recovery - limite por minuto'),
('rate_limit_recovery_batch_penalty_ms', '1000', 'Config recovery - penalidade batch (ms)')
ON CONFLICT (chave) DO NOTHING;

-- =====================================================
-- 2. DOCUMENT HANDLER THRESHOLDS
-- =====================================================
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('doc_fatura_min_matches', '3', 'Mínimo de keywords para detectar fatura de energia'),
('doc_identidade_min_matches', '2', 'Mínimo de keywords para detectar documento de identidade'),
('doc_contrato_min_matches', '2', 'Mínimo de keywords para detectar contrato social'),
('doc_max_size_mb', '15', 'Tamanho máximo de documento em MB'),
('doc_collection_stages', '["proposta_inicial_enviada","analise_documentos","proposta_definitiva","aguardando_documentos"]', 'Stages do Bitrix elegíveis para coleta de documentos (JSON array)')
ON CONFLICT (chave) DO NOTHING;

-- =====================================================
-- 3. DETECTION PATTERNS - Document Filename Keywords
-- Pattern armazenado como lista separada por vírgula
-- =====================================================
INSERT INTO sofia_detection_patterns (category, pattern_type, pattern, is_active, priority, description) VALUES
-- Filename patterns para detecção de tipo de documento
('doc_filename_fatura', 'keyword', 'fatura,conta,energia,luz,eletrica', true, 100, 'Keywords para detectar fatura no nome do arquivo'),
('doc_filename_identidade', 'keyword', 'cnh,identidade,rg,documento,cpf', true, 100, 'Keywords para detectar documento de identidade no nome do arquivo'),
('doc_filename_contrato', 'keyword', 'contrato,social,alteracao,junta,comercial', true, 100, 'Keywords para detectar contrato social no nome do arquivo')
ON CONFLICT DO NOTHING;

-- =====================================================
-- 4. DETECTION PATTERNS - Distribuidora Context
-- =====================================================
INSERT INTO sofia_detection_patterns (category, pattern_type, pattern, is_active, priority, description) VALUES
-- Regex patterns para contexto de distribuidora
('distribuidora_generic_context', 'regex', 'energia\\s+solar', true, 80, 'Contexto genérico - energia solar'),
('distribuidora_generic_context', 'regex', 'coesa\\s+energia', true, 80, 'Contexto genérico - Coesa Energia'),
('distribuidora_generic_context', 'regex', 'painel\\s+solar', true, 80, 'Contexto genérico - painel solar'),
('distribuidora_generic_context', 'regex', 'usina\\s+solar', true, 80, 'Contexto genérico - usina solar'),
('distribuidora_generic_context', 'regex', 'geracao\\s+distribuida', true, 80, 'Contexto genérico - geração distribuída'),
-- Keywords para contexto genérico
('distribuidora_generic_context', 'keyword', 'fotovoltaico,fotovoltaica,gd,autoconsumo,compensacao', true, 70, 'Keywords de contexto genérico de energia')
ON CONFLICT DO NOTHING;

-- =====================================================
-- 5. DETECTION PATTERNS - Audio Announcement Strip
-- =====================================================
INSERT INTO sofia_detection_patterns (category, pattern_type, pattern, is_active, priority, description) VALUES
('audio_announcement_strip', 'regex', '^vou te (?:mandar|enviar) (?:um )?[áa]udio', true, 100, 'Pattern para remover anúncio de áudio - vou te mandar'),
('audio_announcement_strip', 'regex', '^segue (?:o )?[áa]udio', true, 100, 'Pattern para remover anúncio de áudio - segue áudio'),
('audio_announcement_strip', 'regex', '^te mandei (?:um )?[áa]udio', true, 100, 'Pattern para remover anúncio de áudio - te mandei'),
('audio_announcement_strip', 'regex', '^olha (?:o )?[áa]udio', true, 100, 'Pattern para remover anúncio de áudio - olha áudio'),
('audio_announcement_strip', 'regex', '^escuta (?:esse |este )?[áa]udio', true, 100, 'Pattern para remover anúncio de áudio - escuta áudio')
ON CONFLICT DO NOTHING;

-- =====================================================
-- 6. MESSAGE TEMPLATES - AI Prompts
-- =====================================================
INSERT INTO sofia_message_templates (category, template_key, template_text, variables, is_active, description) VALUES
('ai_prompts', 'distribuidora_context_analysis', 
'Analise a seguinte mensagem e determine se ela menciona uma distribuidora de energia elétrica.

Mensagem: "{message}"

Responda em JSON com:
- detected: boolean (se menciona distribuidora)
- distribuidora: string | null (nome detectado)
- confidence: number (0-1)
- isTypo: boolean (se parece ser erro de digitação)
- suggestedCorrection: string | null (correção sugerida se for typo)
- context: "distributor_mention" | "generic_energy" | "company_name" | "product" | "unknown"
- reasoning: string (explicação breve)',
ARRAY['message'], true, 'Prompt para análise de contexto de distribuidora via IA')
ON CONFLICT DO NOTHING;

-- =====================================================
-- 7. FALLBACK KEYWORDS - Document Detection
-- Pattern armazenado como lista separada por vírgula
-- =====================================================
INSERT INTO sofia_detection_patterns (category, pattern_type, pattern, is_active, priority, description) VALUES
-- Fallback keywords para detecção de fatura
('doc_fatura', 'keyword', 'fatura,conta de luz,conta de energia,consumo kwh,distribuidora,cemig,cpfl,coelba,tusd,unidade consumidora,valor total,energia elétrica,kwh', true, 90, 'Keywords fallback para detecção de fatura de energia'),
-- Fallback keywords para detecção de identidade
('doc_identidade', 'keyword', 'carteira de identidade,registro geral,cnh,habilitação,documento de identidade,órgão emissor,rg,cpf', true, 90, 'Keywords fallback para detecção de documento de identidade'),
-- Fallback keywords para detecção de contrato social
('doc_contrato_social', 'keyword', 'contrato social,alteração contratual,razão social,objeto social,sócios,capital social,junta comercial,nire', true, 90, 'Keywords fallback para detecção de contrato social'),
-- Fallback keywords para invoice detection
('doc_invoice', 'keyword', 'fatura de energia,conta de luz,consumo kwh,distribuidora,cemig,copel,cpfl,enel,tusd,te ,tarifa,kWh', true, 90, 'Keywords fallback para detecção de invoice/fatura')
ON CONFLICT DO NOTHING;