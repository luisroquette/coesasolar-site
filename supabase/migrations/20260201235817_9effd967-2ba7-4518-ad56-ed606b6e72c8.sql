-- Add notification_types column to daily_report_recipients
-- This allows filtering which notifications each recipient receives
ALTER TABLE public.daily_report_recipients 
ADD COLUMN IF NOT EXISTS notification_types text[] DEFAULT ARRAY['daily_report', 'hot_lead']::text[];

-- Add comment for documentation
COMMENT ON COLUMN public.daily_report_recipients.notification_types IS 'Types of notifications this recipient should receive: daily_report, hot_lead, contract_signed, etc.';

-- Update existing recipients to receive all notification types
UPDATE public.daily_report_recipients 
SET notification_types = ARRAY['daily_report', 'hot_lead']::text[]
WHERE notification_types IS NULL;