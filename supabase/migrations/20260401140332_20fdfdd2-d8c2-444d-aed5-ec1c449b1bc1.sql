CREATE OR REPLACE FUNCTION public.sum_proposal_view_duration(p_proposal_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(duration_seconds), 0)::INTEGER
  FROM public.proposal_views
  WHERE proposal_id = p_proposal_id;
$$;