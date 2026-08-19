-- Add llm_model field to persona JSONB for existing agents
-- This allows each agent to have its own LLM model configuration

-- Update Sofia (text) with default model
UPDATE public.ai_agents
SET persona = COALESCE(persona, '{}'::jsonb) || '{"llm_model": "google/gemini-3-flash-preview"}'::jsonb
WHERE agent_id = 'sofia' AND persona->>'llm_model' IS NULL;

-- Update Sofia Voice with faster model for latency
UPDATE public.ai_agents
SET persona = COALESCE(persona, '{}'::jsonb) || '{"llm_model": "google/gemini-2.5-flash-lite"}'::jsonb
WHERE agent_id = 'sofia_inbound_sales_' AND persona->>'llm_model' IS NULL;

-- Update Maria with default model
UPDATE public.ai_agents
SET persona = COALESCE(persona, '{}'::jsonb) || '{"llm_model": "google/gemini-3-flash-preview"}'::jsonb
WHERE agent_id = 'maria' AND persona->>'llm_model' IS NULL;

-- Update Julia with default model
UPDATE public.ai_agents
SET persona = COALESCE(persona, '{}'::jsonb) || '{"llm_model": "google/gemini-3-flash-preview"}'::jsonb
WHERE agent_id = 'julia' AND persona->>'llm_model' IS NULL;

-- Set default model for any other agents that don't have one
UPDATE public.ai_agents
SET persona = COALESCE(persona, '{}'::jsonb) || '{"llm_model": "google/gemini-3-flash-preview"}'::jsonb
WHERE persona->>'llm_model' IS NULL;