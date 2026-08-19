
-- ============================================
-- Table: improvement_proposals
-- Self-analysis engine for agent self-improvement
-- ============================================

CREATE TABLE public.improvement_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL DEFAULT 'sofia',
  category TEXT NOT NULL CHECK (category IN ('prompt', 'flow', 'guardrail', 'rule', 'fast_path', 'constitution')),
  title TEXT NOT NULL,
  problem_description TEXT NOT NULL,
  evidence JSONB DEFAULT '{}',
  proposed_change TEXT NOT NULL,
  expected_impact TEXT,
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  confidence FLOAT NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'rolled_back')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  applied_at TIMESTAMPTZ,
  rollback_at TIMESTAMPTZ,
  rollback_reason TEXT,
  source TEXT NOT NULL DEFAULT 'auto_analysis' CHECK (source IN ('auto_analysis', 'operator_feedback', 'manual', 'self_analysis')),
  run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_improvement_proposals_status ON public.improvement_proposals(status);
CREATE INDEX idx_improvement_proposals_agent ON public.improvement_proposals(agent_id);
CREATE INDEX idx_improvement_proposals_category ON public.improvement_proposals(category);
CREATE INDEX idx_improvement_proposals_created ON public.improvement_proposals(created_at DESC);

-- RLS
ALTER TABLE public.improvement_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view proposals"
  ON public.improvement_proposals FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert proposals"
  ON public.improvement_proposals FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update proposals"
  ON public.improvement_proposals FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Updated_at trigger
CREATE TRIGGER update_improvement_proposals_updated_at
  BEFORE UPDATE ON public.improvement_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
