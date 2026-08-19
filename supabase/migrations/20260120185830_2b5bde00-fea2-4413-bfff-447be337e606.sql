-- Add custom LLM configuration fields to persona JSONB
-- This allows agents to use external LLM providers via API keys

-- The structure will be stored in persona.llm_config:
-- {
--   "model": "google/gemini-3-flash-preview" or "custom:anthropic:claude-3-5-sonnet",
--   "provider": "lovable" | "custom",
--   "custom_provider": "anthropic" | "openai-direct" | "groq" | etc,
--   "custom_base_url": "https://api.anthropic.com/v1",
--   "custom_model_id": "claude-3-5-sonnet-20241022"
-- }
-- Note: API keys are stored in agent_secrets table

-- Ensure default llm_model is set for agents that don't have it
UPDATE public.ai_agents
SET persona = jsonb_set(
  COALESCE(persona, '{}'::jsonb),
  '{llm_model}',
  '"google/gemini-3-flash-preview"'::jsonb
)
WHERE persona IS NULL 
   OR persona->>'llm_model' IS NULL;