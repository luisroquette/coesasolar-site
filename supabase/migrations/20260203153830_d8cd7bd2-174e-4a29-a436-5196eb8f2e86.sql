-- Policies explícitas (negam tudo) para evitar 'RLS enabled no policy'
DO $$
BEGIN
  -- SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'human_takeovers'
      AND policyname = 'deny_select_human_takeovers'
  ) THEN
    CREATE POLICY deny_select_human_takeovers
    ON public.human_takeovers
    FOR SELECT
    USING (false);
  END IF;

  -- INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'human_takeovers'
      AND policyname = 'deny_insert_human_takeovers'
  ) THEN
    CREATE POLICY deny_insert_human_takeovers
    ON public.human_takeovers
    FOR INSERT
    WITH CHECK (false);
  END IF;

  -- UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'human_takeovers'
      AND policyname = 'deny_update_human_takeovers'
  ) THEN
    CREATE POLICY deny_update_human_takeovers
    ON public.human_takeovers
    FOR UPDATE
    USING (false);
  END IF;

  -- DELETE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'human_takeovers'
      AND policyname = 'deny_delete_human_takeovers'
  ) THEN
    CREATE POLICY deny_delete_human_takeovers
    ON public.human_takeovers
    FOR DELETE
    USING (false);
  END IF;
END $$;
