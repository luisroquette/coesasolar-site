-- Create table to log operator commands (#ASSUMIR, #RESOLVIDO, etc.)
CREATE TABLE public.operator_command_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  command TEXT NOT NULL,
  operator_phone TEXT,
  operator_name TEXT,
  client_phone TEXT,
  client_name TEXT,
  conversa_id UUID REFERENCES public.chatbot_conversas(id),
  action_result TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for quick lookups
CREATE INDEX idx_operator_command_logs_created_at ON public.operator_command_logs(created_at DESC);
CREATE INDEX idx_operator_command_logs_command ON public.operator_command_logs(command);

-- Enable RLS
ALTER TABLE public.operator_command_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read logs
CREATE POLICY "Authenticated users can view operator logs" 
ON public.operator_command_logs 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Allow service role to insert logs (from edge functions)
CREATE POLICY "Service role can insert operator logs" 
ON public.operator_command_logs 
FOR INSERT 
WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.operator_command_logs IS 'Logs of operator control commands (#ASSUMIR, #RESOLVIDO, etc.)';