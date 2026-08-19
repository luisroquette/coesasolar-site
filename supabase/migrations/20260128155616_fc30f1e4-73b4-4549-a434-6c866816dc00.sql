-- Add columns for tracking RAG skip events
ALTER TABLE public.rag_usage_logs 
ADD COLUMN IF NOT EXISTS was_skipped BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS skip_reason TEXT,
ADD COLUMN IF NOT EXISTS trigger_confidence TEXT;

-- Create index for skip analysis
CREATE INDEX IF NOT EXISTS idx_rag_usage_logs_was_skipped ON public.rag_usage_logs(was_skipped);
CREATE INDEX IF NOT EXISTS idx_rag_usage_logs_created_at ON public.rag_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_usage_logs_skip_reason ON public.rag_usage_logs(skip_reason) WHERE skip_reason IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.rag_usage_logs.was_skipped IS 'Whether RAG search was skipped due to smart filter';
COMMENT ON COLUMN public.rag_usage_logs.skip_reason IS 'Reason for skipping RAG (rag_skip_* categories)';
COMMENT ON COLUMN public.rag_usage_logs.trigger_confidence IS 'Confidence level of RAG trigger decision (high/medium/low)';