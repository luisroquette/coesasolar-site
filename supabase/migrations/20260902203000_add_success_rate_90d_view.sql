-- Medição real da taxa de sucesso (02/09/2026): sem isso, "99,9%" é opinião, não dado.
-- View pura de agregação sobre coesa_blog_run_log — leitura, sem custo, sem PII. Não altera
-- o ig-sentinel (repo separado, sessões concorrentes trabalhando lá agora) — expõe o dado
-- pra quem quiser consultar (Sentinel, dashboard futuro, ou consulta manual).
create or replace view public.coesa_blog_success_rate_90d as
select
  count(*) filter (where status = 'success') as successes,
  count(*) as total_run_days,
  round(100.0 * count(*) filter (where status = 'success') / nullif(count(*), 0), 1) as success_rate_pct
from public.coesa_blog_run_log
where run_date >= current_date - interval '90 days';
