-- =====================================================
-- Zero Hardcode: CRM, Propostas, Validação de Imagem
-- =====================================================

-- CRM Status Options (cores e labels)
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES (
  'crm_status_options',
  '[{"value":"novo","label":"Novo","color":"bg-blue-100 text-blue-800"},{"value":"contatado","label":"Contatado","color":"bg-yellow-100 text-yellow-800"},{"value":"interessado","label":"Interessado","color":"bg-purple-100 text-purple-800"},{"value":"negociando","label":"Negociando","color":"bg-orange-100 text-orange-800"},{"value":"fechado","label":"Fechado","color":"bg-green-100 text-green-800"},{"value":"perdido","label":"Perdido","color":"bg-red-100 text-red-800"},{"value":"erro","label":"Erro","color":"bg-red-600 text-white"}]',
  'Status disponíveis no CRM com cores (JSON array)'
)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- CRM Origem Labels
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES (
  'crm_origem_labels',
  '{"proposta_assinante":"Proposta Assinante","proposta_usineiro":"Proposta Usineiro","manual":"Cadastro Manual","bitrix24_webhook":"Bitrix24 (Auto)","whatsapp_sofia":"WhatsApp (sofIA)"}',
  'Labels de origem dos contatos no CRM (JSON object)'
)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Propostas Status Options
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES (
  'propostas_status_options',
  '[{"value":"all","label":"Todos os status"},{"value":"rascunho","label":"Rascunho"},{"value":"enviada","label":"Enviada"},{"value":"aceita","label":"Aceita"},{"value":"recusada","label":"Recusada"}]',
  'Opções de filtro de status de propostas (JSON array)'
)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Propostas Status Badges
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES (
  'propostas_status_badges',
  '{"rascunho":{"variant":"secondary","label":"Rascunho"},"enviada":{"variant":"default","label":"Enviada"},"aceita":{"variant":"default","label":"Aceita"},"recusada":{"variant":"destructive","label":"Recusada"}}',
  'Configuração de badges por status de proposta (JSON object)'
)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- =====================================================
-- Validação de Qualidade de Imagem
-- =====================================================

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('image_quality_min_width', '400', 'Largura mínima para validação de imagem (px)'),
  ('image_quality_min_height', '300', 'Altura mínima para validação de imagem (px)'),
  ('image_quality_min_brightness', '40', 'Brilho mínimo (0-255)'),
  ('image_quality_max_brightness', '240', 'Brilho máximo (0-255)'),
  ('image_quality_min_contrast', '25', 'Contraste mínimo (detecção de blur)'),
  ('image_quality_aspect_ratio_min', '0.4', 'Proporção mínima (detecta crop)'),
  ('image_quality_aspect_ratio_max', '3.0', 'Proporção máxima (detecta crop)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Mensagens de erro de validação de imagem
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES (
  'image_quality_messages',
  '{"small":"Imagem muito pequena ({{width}}x{{height}}px). Mínimo recomendado: {{minWidth}}x{{minHeight}}px","cropped_conta":"A proporção da imagem parece incorreta. Certifique-se de capturar toda a conta de luz.","cropped_doc":"A proporção da imagem parece incorreta. Certifique-se de capturar o documento inteiro.","dark":"A imagem está muito escura. Tente fotografar com melhor iluminação.","bright":"A imagem está muito clara ou com reflexo. Evite luz direta sobre o documento.","blurry":"A imagem parece estar borrada. Mantenha a câmera firme e o documento em foco.","validation_error":"Não foi possível validar a qualidade da imagem."}',
  'Mensagens de erro para validação de qualidade de imagem (JSON)'
)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- =====================================================
-- Bitrix24 Stage Names (fallback)
-- =====================================================

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES (
  'bitrix24_default_stage_names',
  '{"NEW":"Novo Lead","IN_PROCESS":"Em Processamento","JUNK":"Perdido/Lixo","WON":"Ganho"}',
  'Nomes padrão dos estágios Bitrix24 (JSON object)'
)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- =====================================================
-- Auth Default Domain
-- =====================================================

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES (
  'auth_default_email_domain',
  '@coesaenergia.com.br',
  'Domínio padrão para preenchimento automático de e-mail no login'
)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- =====================================================
-- Edge Functions: Constantes de Processamento
-- =====================================================

-- Payload e mensagens
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('edge_max_payload_size_mb', '15', 'Tamanho máximo de payload em MB para Edge Functions'),
  ('edge_max_message_length', '4000', 'Tamanho máximo de mensagem WhatsApp'),
  ('edge_max_history_length', '50', 'Máximo de mensagens no histórico'),
  ('edge_max_history_message_length', '10000', 'Tamanho máximo de uma mensagem no histórico'),
  ('edge_max_total_history_size', '80000', 'Tamanho total máximo do histórico (bytes)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Cleanup e batch sizes
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('cleanup_audio_max_age_hours', '24', 'Idade máxima em horas para limpeza de áudios'),
  ('rag_embedding_batch_size', '5', 'Tamanho do batch para geração de embeddings'),
  ('link_webhook_cooldown_ms', '60000', 'Cooldown em ms entre envios do link-webhook')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- =====================================================
-- Simulador de Agente (histórico)
-- =====================================================

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES (
  'simulator_max_history_msg_length',
  '1800',
  'Tamanho máximo de mensagem individual no simulador de agente'
)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();