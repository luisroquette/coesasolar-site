
-- ═══════════════════════════════════════════════════════════════════════════════
-- P5: Fix SECURITY DEFINER views - Recreate with SECURITY INVOKER
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop and recreate v_llm_daily_costs with SECURITY INVOKER
DROP VIEW IF EXISTS public.v_llm_daily_costs;

CREATE VIEW public.v_llm_daily_costs
WITH (security_invoker = true)
AS
SELECT 
    date(created_at) AS date,
    model,
    agent_id,
    count(*) AS calls,
    sum(input_tokens) AS total_input_tokens,
    sum(output_tokens) AS total_output_tokens,
    sum(cost_usd) AS total_cost_usd,
    avg(cost_usd) AS avg_cost_per_call
FROM llm_usage_log
GROUP BY date(created_at), model, agent_id
ORDER BY date(created_at) DESC, sum(cost_usd) DESC;

-- Add comment for documentation
COMMENT ON VIEW public.v_llm_daily_costs IS 'Daily LLM usage costs aggregated by model and agent. Uses SECURITY INVOKER to respect RLS policies.';

-- Drop and recreate v_llm_monthly_costs with SECURITY INVOKER
DROP VIEW IF EXISTS public.v_llm_monthly_costs;

CREATE VIEW public.v_llm_monthly_costs
WITH (security_invoker = true)
AS
SELECT 
    to_char(created_at, 'YYYY-MM') AS month,
    model,
    agent_id,
    count(*) AS calls,
    sum(cost_usd) AS total_cost_usd,
    avg(cost_usd) AS avg_cost_per_call
FROM llm_usage_log
GROUP BY to_char(created_at, 'YYYY-MM'), model, agent_id
ORDER BY to_char(created_at, 'YYYY-MM') DESC, sum(cost_usd) DESC;

-- Add comment for documentation
COMMENT ON VIEW public.v_llm_monthly_costs IS 'Monthly LLM usage costs aggregated by model and agent. Uses SECURITY INVOKER to respect RLS policies.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- P4: Clean up exhausted pending messages (all from Jan 23, 2026 with expired tokens)
-- These messages failed due to Z-API client-token misconfiguration and cannot be retried
-- ═══════════════════════════════════════════════════════════════════════════════

-- Mark old failed messages as resolved with reason
UPDATE public.chatbot_mensagens_pendentes
SET 
    resolution_status = 'abandoned_stale',
    resolved_at = now()
WHERE 
    resolution_status IS NULL
    AND tentativas >= 3
    AND created_at < now() - INTERVAL '7 days';

-- ═══════════════════════════════════════════════════════════════════════════════
-- P3: Clean up old failed proposal queue items (from Jan 28, 2026)
-- These failed due to "No lead ID" - the leads were never created in Bitrix
-- ═══════════════════════════════════════════════════════════════════════════════

-- Update failed items older than 5 days to 'abandoned' status
UPDATE public.proposal_generation_queue
SET 
    status = 'abandoned',
    resolved_at = now()
WHERE 
    status = 'failed'
    AND created_at < now() - INTERVAL '5 days';

-- Also mark very old 'processing' items as stuck
UPDATE public.proposal_generation_queue
SET 
    status = 'stuck',
    failure_reason = COALESCE(failure_reason, '') || ' [Auto-marked as stuck after 5 days in processing]'
WHERE 
    status = 'processing'
    AND created_at < now() - INTERVAL '5 days';
