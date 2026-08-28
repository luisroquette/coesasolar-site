-- Quando a Vercel encerra /api/blog/generate por maxDuration=300s, o catch da
-- rota NÃO executa (processo é morto, não lança exceção). O run_log fica 'running'
-- para sempre e o monitor detecta backlog (sem artigo, cron não completou).
-- Este fix marca runs 'running' de DIAS ANTERIORES como 'error' no momento do
-- claim do dia seguinte — assim o próximo cron limpa o entulho cross-day.
create or replace function public.coesa_blog_claim_run(p_secret text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare claimed boolean;
begin
  -- Limpa runs 'running' de dias anteriores que a Vercel matou antes do catch.
  -- Só os do próprio dia corrente podem ser reclaim (retry das 13:30/18:50).
  update public.coesa_blog_run_log
  set status = 'error',
      error = 'Vercel maxDuration exceeded — process killed before catch',
      created_at = now()
  where run_date < current_date and status = 'running';

  insert into public.coesa_blog_run_log (run_date, status)
  values (current_date, 'running')
  on conflict (run_date) do update
    set status = 'running', error = null, created_at = now()
    where public.coesa_blog_run_log.status = 'error'
       or (
         public.coesa_blog_run_log.status = 'running'
         and public.coesa_blog_run_log.created_at < now() - interval '6 minutes'
       )
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.coesa_blog_claim_run(text) from public, anon, authenticated;
grant execute on function public.coesa_blog_claim_run(text) to service_role;