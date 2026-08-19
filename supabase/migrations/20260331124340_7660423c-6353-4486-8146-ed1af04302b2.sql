
-- Table to track every proposal view
CREATE TABLE public.proposal_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.propostas_assinantes(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  fingerprint TEXT -- hash of IP + user_agent for unique counting
);

-- Index for fast lookups by proposal
CREATE INDEX idx_proposal_views_proposal_id ON public.proposal_views(proposal_id);
CREATE INDEX idx_proposal_views_fingerprint ON public.proposal_views(proposal_id, fingerprint);

-- RLS: only service_role can insert (from edge function), admins can read
ALTER TABLE public.proposal_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view proposal_views"
ON public.proposal_views
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Allow service_role full access (edge function inserts)
CREATE POLICY "Service role full access on proposal_views"
ON public.proposal_views
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
