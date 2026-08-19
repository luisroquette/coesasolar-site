-- Criar bucket para armazenar código-fonte dos agentes
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-sources', 'agent-sources', false)
ON CONFLICT (id) DO NOTHING;

-- RLS para o bucket - apenas admins podem acessar
CREATE POLICY "Admins can read agent sources"
ON storage.objects
FOR SELECT
USING (bucket_id = 'agent-sources' AND EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = auth.uid() AND role = 'admin'
));

CREATE POLICY "Admins can upload agent sources"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'agent-sources' AND EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = auth.uid() AND role = 'admin'
));

CREATE POLICY "Admins can update agent sources"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'agent-sources' AND EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = auth.uid() AND role = 'admin'
));

CREATE POLICY "Admins can delete agent sources"
ON storage.objects
FOR DELETE
USING (bucket_id = 'agent-sources' AND EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = auth.uid() AND role = 'admin'
));