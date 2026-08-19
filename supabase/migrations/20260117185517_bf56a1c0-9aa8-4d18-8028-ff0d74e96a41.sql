-- Create storage bucket for KB documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('kb-documents', 'kb-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to kb-documents
CREATE POLICY "Authenticated users can upload KB documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'kb-documents');

-- Allow authenticated users to read KB documents
CREATE POLICY "Authenticated users can read KB documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'kb-documents');

-- Allow authenticated users to delete KB documents
CREATE POLICY "Authenticated users can delete KB documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'kb-documents');