-- Add contract tracking fields to chatbot_conversas
ALTER TABLE public.chatbot_conversas
ADD COLUMN IF NOT EXISTS contrato_enviado_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS contrato_assinado BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS contrato_assinado_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS contract_nudge_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_contract_nudge_at TIMESTAMPTZ;

-- Create index for contract nudge scheduling
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_contract_nudge 
ON public.chatbot_conversas(contrato_enviado_at, next_contract_nudge_at)
WHERE contrato_enviado_at IS NOT NULL AND contrato_assinado = FALSE;

-- Insert default contract nudge configurations (in hours)
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('contract_nudge_1_delay_hours', '2', 'Horas para o primeiro nudge de contrato após envio'),
  ('contract_nudge_2_delay_hours', '24', 'Horas para o segundo nudge de contrato'),
  ('contract_nudge_3_delay_hours', '48', 'Horas para o terceiro nudge de contrato'),
  ('contract_nudge_1_messages', 'E aí, conseguiu dar uma olhada no contrato? Posso resumir os pontos principais se quiser!
Tudo certo com o e-mail do contrato? Se não encontrou, posso pedir pra reenviar.
Ficou alguma dúvida sobre o contrato? Tô aqui pra ajudar!
Vi que o contrato foi enviado. Quer que eu explique alguma cláusula?', 'Mensagens do primeiro nudge de contrato (uma por linha)'),
  ('contract_nudge_2_messages', 'Oi! Passando pra lembrar que seu contrato tá esperando assinatura. Menos de 1 minuto e você já começa a economizar! 💚
Seu desconto está a uma assinatura de distância! Posso ajudar com algo?
Vi que o contrato ainda não foi assinado. Tem algo que posso esclarecer?
Lembrete gentil: seu contrato digital está aguardando. Alguma dúvida sobre as cláusulas?', 'Mensagens do segundo nudge de contrato (uma por linha)'),
  ('contract_nudge_3_messages', 'Olá! Notei que o contrato ainda está pendente. Se tiver qualquer dúvida, estou à disposição!
Última lembrança: seu contrato está aguardando assinatura. Após assinar, a economia começa em até 90 dias!
Posso ajudar com alguma cláusula específica? Tô aqui pra descomplicar 😊
Seu contrato segue disponível para assinatura. Me avisa se precisar de ajuda com algum ponto!', 'Mensagens do terceiro nudge de contrato (uma por linha)')
ON CONFLICT (chave) DO NOTHING;

-- Add comment for documentation
COMMENT ON COLUMN public.chatbot_conversas.contrato_enviado_at IS 'Data/hora em que o contrato foi enviado para assinatura via ClickSign';
COMMENT ON COLUMN public.chatbot_conversas.contrato_assinado IS 'Indica se o contrato foi assinado pelo cliente';
COMMENT ON COLUMN public.chatbot_conversas.contrato_assinado_at IS 'Data/hora em que o contrato foi assinado';
COMMENT ON COLUMN public.chatbot_conversas.contract_nudge_count IS 'Número de nudges de contrato enviados (0-3)';
COMMENT ON COLUMN public.chatbot_conversas.next_contract_nudge_at IS 'Próximo nudge de contrato agendado';