-- 1. Adicionar configuração de threshold para grandes contas
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES (
  'big_account_threshold_reais',
  '3000',
  'Valor mínimo em reais para disparar alerta de grande conta via WhatsApp'
) ON CONFLICT (chave) DO NOTHING;

-- 2. Atualizar telefone do Eric para o novo número e adicionar big_account aos tipos de notificação
UPDATE daily_report_recipients 
SET telefone = '5531997897800',
    notification_types = array_append(
      COALESCE(notification_types, ARRAY[]::text[]), 
      'big_account'
    )
WHERE nome = 'Eric' 
  AND NOT ('big_account' = ANY(COALESCE(notification_types, ARRAY[]::text[])));

-- 3. Adicionar big_account ao Luis (mantendo telefone atual)
UPDATE daily_report_recipients 
SET notification_types = array_append(
      COALESCE(notification_types, ARRAY[]::text[]), 
      'big_account'
    )
WHERE nome = 'Luis' 
  AND NOT ('big_account' = ANY(COALESCE(notification_types, ARRAY[]::text[])));