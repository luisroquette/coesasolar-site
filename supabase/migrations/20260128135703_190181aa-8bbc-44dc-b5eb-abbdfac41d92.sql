-- Create table to store regression test results
CREATE TABLE IF NOT EXISTS public.regression_test_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_tests INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggered_by TEXT DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.regression_test_runs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role can manage regression tests"
  ON public.regression_test_runs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to view results
CREATE POLICY "Authenticated users can view regression tests"
  ON public.regression_test_runs
  FOR SELECT
  TO authenticated
  USING (true);

-- Add index for querying by date
CREATE INDEX idx_regression_test_runs_executed_at ON public.regression_test_runs(executed_at DESC);

-- Schedule daily execution at 6 AM (UTC-3 = 9 AM São Paulo)
SELECT cron.schedule(
  'sofia-regression-tests-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://cvcdweqybgfxywcelriq.supabase.co/functions/v1/sofia-regression-tests',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2Y2R3ZXF5YmdmeHl3Y2VscmlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MDAzNDksImV4cCI6MjA4MzM3NjM0OX0.qByJBHetEv8omb6iDyghxcGkA2KRlYnwzvOVtwePo3U"}'::jsonb,
    body := '{"triggered_by": "cron_daily"}'::jsonb
  ) AS request_id;
  $$
);