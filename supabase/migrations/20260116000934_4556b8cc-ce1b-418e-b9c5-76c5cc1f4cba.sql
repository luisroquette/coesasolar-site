-- Add column to track document source preference
ALTER TABLE public.chatbot_conversas 
ADD COLUMN IF NOT EXISTS docs_source TEXT DEFAULT NULL;

-- Add column to track individual document sources
ALTER TABLE public.chatbot_conversas
ADD COLUMN IF NOT EXISTS docs_received_whatsapp JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.chatbot_conversas
ADD COLUMN IF NOT EXISTS docs_received_page JSONB DEFAULT '[]'::jsonb;

-- Add timestamp for first document received
ALTER TABLE public.chatbot_conversas
ADD COLUMN IF NOT EXISTS first_doc_received_at TIMESTAMPTZ DEFAULT NULL;

-- Add timestamp for all docs complete
ALTER TABLE public.chatbot_conversas
ADD COLUMN IF NOT EXISTS all_docs_complete_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_chatbot_conversas_docs_source 
ON public.chatbot_conversas(docs_source) 
WHERE docs_source IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.chatbot_conversas.docs_source IS 'Primary source of documents: whatsapp, page, or mixed';
COMMENT ON COLUMN public.chatbot_conversas.docs_received_whatsapp IS 'Array of document types received via WhatsApp: ["rg", "fatura", "contrato_social"]';
COMMENT ON COLUMN public.chatbot_conversas.docs_received_page IS 'Array of document types received via page link: ["rg", "fatura", "contrato_social"]';