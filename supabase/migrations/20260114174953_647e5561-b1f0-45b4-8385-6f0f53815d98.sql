-- Add ChatApp operator ID to whatsapp_atendentes
ALTER TABLE public.whatsapp_atendentes
ADD COLUMN IF NOT EXISTS chatapp_operator_id integer;

-- Add comment explaining the field
COMMENT ON COLUMN public.whatsapp_atendentes.chatapp_operator_id IS 'ID do operador/funcionário no ChatApp (encontrado em Meu Negócio > Funcionários)';