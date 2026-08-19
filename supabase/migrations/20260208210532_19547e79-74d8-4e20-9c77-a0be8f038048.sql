
CREATE TABLE IF NOT EXISTS public.rag_search_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_id text,
  query_text text NOT NULL,
  funnel_stage text,
  chunks_returned integer DEFAULT 0,
  top_similarity float,
  chunks_used jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.rag_search_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on rag_search_log"
  ON public.rag_search_log
  FOR ALL
  USING (true)
  WITH CHECK (true);
