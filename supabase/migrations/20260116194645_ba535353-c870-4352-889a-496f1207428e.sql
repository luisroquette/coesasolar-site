-- Add bitrix24_stage column to crm_contatos for tracking the lead stage
ALTER TABLE public.crm_contatos 
ADD COLUMN IF NOT EXISTS bitrix24_stage TEXT DEFAULT NULL;

-- Add index for filtering by stage
CREATE INDEX IF NOT EXISTS idx_crm_contatos_bitrix24_stage ON public.crm_contatos(bitrix24_stage);

-- Add comment for documentation
COMMENT ON COLUMN public.crm_contatos.bitrix24_stage IS 'ID do estágio atual do lead no Bitrix24 (ex: UC_9SLRPP, IN_PROCESS)';