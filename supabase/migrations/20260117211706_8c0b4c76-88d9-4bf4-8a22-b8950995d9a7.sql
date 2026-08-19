-- Ensure system settings keys are unique so UI upserts work reliably
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'configuracoes_sistema_chave_unique'
  ) THEN
    CREATE UNIQUE INDEX configuracoes_sistema_chave_unique
      ON public.configuracoes_sistema (chave);
  END IF;
END $$;

-- Seed missing sofIA audio settings so defaults become configurable from the UI
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES
  ('sofia_audio_congruence_enabled', 'true', 'sofIA: regra de congruência (cliente envia áudio -> responder em áudio).'),
  ('sofia_audio_offer_doubts_enabled', 'true', 'sofIA: oferecer áudio quando detectar múltiplas dúvidas/confusão.'),
  ('sofia_audio_min_chars_congruence', '50', 'sofIA: mínimo de caracteres na transcrição para disparar congruência.'),
  ('sofia_audio_min_chars_offer', '250', 'sofIA: mínimo de caracteres na resposta para oferecer áudio.' )
ON CONFLICT (chave) DO NOTHING;