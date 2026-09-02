-- Suporte ao alerta em tempo real na 1ª falha do dia (achado 02/09/2026): sem isso, uma
-- falha só vira visível no relatório do Sentinel do dia SEGUINTE — tarde demais pra
-- intervenção manual no mesmo dia útil, que foi o que salvou a publicação de hoje.
-- coesa_blog_mark_alerted é atômico igual coesa_blog_claim_run: só retorna true na
-- PRIMEIRA chamada do dia (evita reenviar e-mail a cada retry de cron do mesmo dia).
alter table public.coesa_blog_run_log add column if not exists alerted boolean not null default false;

create or replace function public.coesa_blog_mark_alerted(p_secret text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare marked boolean;
begin
  update public.coesa_blog_run_log
  set alerted = true
  where run_date = current_date and alerted = false
  returning true into marked;
  return coalesce(marked, false);
end;
$$;

revoke all on function public.coesa_blog_mark_alerted(text) from public, anon, authenticated;
grant execute on function public.coesa_blog_mark_alerted(text) to service_role;
