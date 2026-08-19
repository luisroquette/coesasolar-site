-- Add 'weekly_report' to existing recipients notification_types
UPDATE public.daily_report_recipients 
SET notification_types = array_append(notification_types, 'weekly_report')
WHERE NOT ('weekly_report' = ANY(notification_types));

-- Setup cron for weekly report - Monday 9h BRT = 12:00 UTC
SELECT cron.schedule(
  'sofia-weekly-stats-seg-9h',
  '0 12 * * 1', -- Every Monday at 12:00 UTC (9:00 BRT)
  $$
  SELECT net.http_post(
    url := 'https://cvcdweqybgfxywcelriq.supabase.co/functions/v1/sofia-weekly-stats',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2Y2R3ZXF5YmdmeHl3Y2VscmlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MDAzNDksImV4cCI6MjA4MzM3NjM0OX0.qByJBHetEv8omb6iDyghxcGkA2KRlYnwzvOVtwePo3U"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);