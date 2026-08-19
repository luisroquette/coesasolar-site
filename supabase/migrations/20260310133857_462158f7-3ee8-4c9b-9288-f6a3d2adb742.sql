INSERT INTO public.concessionarias (nome, tarifa_media, tarifa_com_impostos, te, tusd, pis_cofins, uf, sigla_aneel, ultima_atualizacao, vigencia_inicio)
VALUES 
  ('Energisa MG', 0.7458, 0.9516, 0.3221, 0.4237, 0.0365, 'MG', 'EMR', now(), '2025-06-22'),
  ('EMR', 0.7458, 0.9516, 0.3221, 0.4237, 0.0365, 'MG', 'EMR', now(), '2025-06-22')
ON CONFLICT DO NOTHING;