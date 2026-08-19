-- Add handler_type column to track which handler processed each response
ALTER TABLE public.chatbot_mensagens 
ADD COLUMN IF NOT EXISTS handler_type VARCHAR(50);

-- Add index for efficient querying by handler_type
CREATE INDEX IF NOT EXISTS idx_chatbot_mensagens_handler_type 
ON public.chatbot_mensagens(handler_type, created_at DESC);

-- Add comment for documentation
COMMENT ON COLUMN public.chatbot_mensagens.handler_type IS 'Tracks which handler processed the response: fast_path_cost, fast_path_minimum_bill, fast_path_discount, fast_path_billing, fast_path_simulation, fast_path_contract, fast_path_winwin, fast_path_validity, fast_path_greeting, fast_path_proposal_sent, deterministic_router, llm_reasoning, automated_followup, human_agent';