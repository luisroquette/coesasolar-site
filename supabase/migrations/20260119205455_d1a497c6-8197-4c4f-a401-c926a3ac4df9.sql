-- Remove the existing unique index that only allows 1 active conversation per phone+provider
DROP INDEX IF EXISTS idx_unique_active_conversation_per_phone;

-- Create new unique index that includes agent_id
-- This allows each agent to have its own active conversation with the same client
CREATE UNIQUE INDEX idx_unique_active_conversation_per_phone_agent 
ON public.chatbot_conversas (cliente_telefone, whatsapp_provider, agent_id) 
WHERE ended_at IS NULL;

-- Add comment explaining the constraint
COMMENT ON INDEX idx_unique_active_conversation_per_phone_agent IS 
'Ensures only one active conversation (ended_at IS NULL) per client phone + provider + agent combination. Allows sofIA, marIA, etc. to have separate simultaneous conversations with the same client.';