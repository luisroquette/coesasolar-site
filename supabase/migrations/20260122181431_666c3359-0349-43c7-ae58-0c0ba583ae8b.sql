-- Create table to track pending pattern changes
CREATE TABLE IF NOT EXISTS public.pattern_change_tracker (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_id UUID,
  change_type TEXT NOT NULL CHECK (change_type IN ('insert', 'update', 'delete')),
  old_data JSONB,
  new_data JSONB,
  changed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pattern_change_tracker ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can manage pattern changes" 
ON public.pattern_change_tracker 
FOR ALL 
USING (true);

-- Function to track pattern changes
CREATE OR REPLACE FUNCTION public.track_pattern_change()
RETURNS TRIGGER AS $$
DECLARE
  pending_count INTEGER;
  snapshot_data JSONB;
  all_patterns JSONB;
  last_snapshot JSONB;
  patterns_added INTEGER := 0;
  patterns_removed INTEGER := 0;
  patterns_modified INTEGER := 0;
  next_version INTEGER;
BEGIN
  -- Insert change record
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.pattern_change_tracker (pattern_id, change_type, old_data, changed_by)
    VALUES (OLD.id, 'delete', to_jsonb(OLD), current_user);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.pattern_change_tracker (pattern_id, change_type, old_data, new_data, changed_by)
    VALUES (NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), current_user);
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.pattern_change_tracker (pattern_id, change_type, new_data, changed_by)
    VALUES (NEW.id, 'insert', to_jsonb(NEW), current_user);
  END IF;

  -- Count pending changes
  SELECT COUNT(*) INTO pending_count FROM public.pattern_change_tracker;

  -- If 10+ changes, create automatic snapshot
  IF pending_count >= 10 THEN
    -- Get all current patterns
    SELECT jsonb_agg(to_jsonb(p)) INTO all_patterns
    FROM public.sofia_detection_patterns p;

    -- Get last snapshot for comparison
    SELECT snapshot INTO last_snapshot
    FROM public.sofia_detection_patterns_versions
    ORDER BY version_number DESC
    LIMIT 1;

    -- Calculate change metrics from tracker
    SELECT 
      COUNT(*) FILTER (WHERE change_type = 'insert'),
      COUNT(*) FILTER (WHERE change_type = 'delete'),
      COUNT(*) FILTER (WHERE change_type = 'update')
    INTO patterns_added, patterns_removed, patterns_modified
    FROM public.pattern_change_tracker;

    -- Get next version number
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
    FROM public.sofia_detection_patterns_versions;

    -- Create snapshot
    INSERT INTO public.sofia_detection_patterns_versions (
      version_number,
      snapshot,
      changelog,
      patterns_added,
      patterns_removed,
      patterns_modified,
      total_patterns,
      created_by_email
    ) VALUES (
      next_version,
      all_patterns,
      'Snapshot automático: ' || pending_count || ' alterações detectadas',
      patterns_added,
      patterns_removed,
      patterns_modified,
      jsonb_array_length(COALESCE(all_patterns, '[]'::jsonb)),
      'sistema@coesa.com.br'
    );

    -- Clear tracker after snapshot
    DELETE FROM public.pattern_change_tracker;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers for pattern changes
DROP TRIGGER IF EXISTS pattern_change_insert_trigger ON public.sofia_detection_patterns;
DROP TRIGGER IF EXISTS pattern_change_update_trigger ON public.sofia_detection_patterns;
DROP TRIGGER IF EXISTS pattern_change_delete_trigger ON public.sofia_detection_patterns;

CREATE TRIGGER pattern_change_insert_trigger
AFTER INSERT ON public.sofia_detection_patterns
FOR EACH ROW EXECUTE FUNCTION public.track_pattern_change();

CREATE TRIGGER pattern_change_update_trigger
AFTER UPDATE ON public.sofia_detection_patterns
FOR EACH ROW EXECUTE FUNCTION public.track_pattern_change();

CREATE TRIGGER pattern_change_delete_trigger
AFTER DELETE ON public.sofia_detection_patterns
FOR EACH ROW EXECUTE FUNCTION public.track_pattern_change();

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_pattern_change_tracker_created_at 
ON public.pattern_change_tracker(created_at DESC);