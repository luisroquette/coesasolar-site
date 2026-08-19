-- Create table for voice call logs (analytics for voice webhook)
CREATE TABLE public.voice_call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id TEXT NOT NULL,
  caller_phone TEXT,
  transcribed_text TEXT NOT NULL,
  reply_text TEXT NOT NULL,
  intent_detected TEXT NOT NULL,
  conversation_stage TEXT NOT NULL,
  next_action TEXT NOT NULL,
  handoff_required BOOLEAN NOT NULL DEFAULT false,
  confidence_level TEXT NOT NULL,
  processing_time_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient querying by call_id
CREATE INDEX idx_voice_call_logs_call_id ON public.voice_call_logs(call_id);
CREATE INDEX idx_voice_call_logs_created_at ON public.voice_call_logs(created_at DESC);
CREATE INDEX idx_voice_call_logs_handoff ON public.voice_call_logs(handoff_required) WHERE handoff_required = true;

-- Enable RLS
ALTER TABLE public.voice_call_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role full access" ON public.voice_call_logs
  FOR ALL USING (true) WITH CHECK (true);

-- Comment on table
COMMENT ON TABLE public.voice_call_logs IS 'Logs de chamadas de voz processadas pelo webhook sofia-voice-webhook para analytics';