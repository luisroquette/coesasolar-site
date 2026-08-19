-- Add configuration for on-call attendant phone number
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES (
  'atendente_plantao_telefone',
  '',
  'Número de WhatsApp do atendente de plantão para receber alertas de escalação (formato: 5531999999999)'
)
ON CONFLICT (chave) DO NOTHING;