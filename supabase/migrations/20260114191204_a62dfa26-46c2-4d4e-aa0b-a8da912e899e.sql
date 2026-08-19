-- Create table to log all webhook events for debugging
CREATE TABLE public.whatsapp_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  provider TEXT NOT NULL DEFAULT 'chatapp',
  request_method TEXT,
  content_type TEXT,
  body_raw TEXT,
  body_parsed JSONB,
  parsed_ok BOOLEAN DEFAULT false,
  event_type TEXT,
  phone TEXT,
  chat_id TEXT,
  message_preview TEXT,
  error_message TEXT,
  processing_status TEXT DEFAULT 'received'
);

-- Enable RLS
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only admins can view webhook events
CREATE POLICY "Admins can view webhook events"
  ON public.whatsapp_webhook_events
  FOR SELECT
  USING (is_admin(auth.uid()));

-- System can insert webhook events (no auth required for webhook)
CREATE POLICY "System can insert webhook events"
  ON public.whatsapp_webhook_events
  FOR INSERT
  WITH CHECK (true);

-- Admins can delete old events
CREATE POLICY "Admins can delete webhook events"
  ON public.whatsapp_webhook_events
  FOR DELETE
  USING (is_admin(auth.uid()));