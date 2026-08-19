-- Create table for pattern version history
CREATE TABLE public.sofia_detection_patterns_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL, -- Full snapshot of all patterns at this version
  changelog TEXT,
  patterns_added INTEGER DEFAULT 0,
  patterns_removed INTEGER DEFAULT 0,
  patterns_modified INTEGER DEFAULT 0,
  total_patterns INTEGER NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sofia_detection_patterns_versions ENABLE ROW LEVEL SECURITY;

-- Policies - allow authenticated users to read and create versions
CREATE POLICY "Authenticated users can read pattern versions"
  ON public.sofia_detection_patterns_versions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create pattern versions"
  ON public.sofia_detection_patterns_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add index for faster lookups
CREATE INDEX idx_patterns_versions_created ON public.sofia_detection_patterns_versions(created_at DESC);
CREATE INDEX idx_patterns_versions_number ON public.sofia_detection_patterns_versions(version_number DESC);

-- Add updated_by tracking to main patterns table
ALTER TABLE public.sofia_detection_patterns 
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS updated_by_email TEXT;

-- Create initial version snapshot from current patterns
INSERT INTO public.sofia_detection_patterns_versions (
  version_number,
  snapshot,
  changelog,
  total_patterns,
  created_by_email
)
SELECT 
  1,
  (SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'category', category,
    'pattern', pattern,
    'pattern_type', pattern_type,
    'description', description,
    'priority', priority,
    'is_active', is_active,
    'response_template', response_template
  )) FROM sofia_detection_patterns),
  'Versão inicial - snapshot automático',
  (SELECT COUNT(*) FROM sofia_detection_patterns),
  'system@coesa.com.br';