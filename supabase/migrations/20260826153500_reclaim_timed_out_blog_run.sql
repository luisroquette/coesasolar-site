-- A Vercel encerra /api/blog/generate em 300s. Se isso acontecer antes do
-- catch da rota, o run permanece "running". Libera um novo claim após 6min:
-- acima do maxDuration e curto o bastante para o próximo retry do mesmo dia.
create or replace function public.coesa_blog_claim_run(p_secret text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare claimed boolean;
begin
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
