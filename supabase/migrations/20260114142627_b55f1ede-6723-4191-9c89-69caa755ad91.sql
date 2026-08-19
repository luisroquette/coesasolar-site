-- Create a public bucket for audio files (PTT messages)
INSERT INTO storage.buckets (id, name, public)
VALUES ('sofia-audio', 'sofia-audio', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public read access to audio files
CREATE POLICY "Public read access for audio files"
ON storage.objects FOR SELECT
USING (bucket_id = 'sofia-audio');

-- Allow service role to insert audio files (from edge functions)
CREATE POLICY "Service role can upload audio"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'sofia-audio');

-- Allow service role to delete old audio files (cleanup)
CREATE POLICY "Service role can delete audio"
ON storage.objects FOR DELETE
USING (bucket_id = 'sofia-audio');