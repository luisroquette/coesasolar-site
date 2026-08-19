CREATE OR REPLACE FUNCTION public.count_unique_fingerprints(p_proposal_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT fingerprint)::INTEGER
  FROM public.proposal_views
  WHERE proposal_id = p_proposal_id;
$$;