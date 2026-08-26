-- Versiona as RPCs críticas do autoblog e remove o SECURITY DEFINER exposto.
-- p_secret permanece na assinatura apenas para rollout compatível; autorização
-- real é o role service_role do JWT server-side.

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
         and public.coesa_blog_run_log.created_at < now() - interval '2 hours'
       )
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function public.coesa_blog_insert_article(
  p_secret text,
  p_slug text,
  p_title text,
  p_page_title text,
  p_meta_desc text,
  p_content text,
  p_cover_url text,
  p_cover_alt text,
  p_keyword text,
  p_category text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare v_final text;
begin
  for v_final in select candidate from unnest(array[p_slug, p_slug || '-2', p_slug || '-3']) as candidate loop
    begin
      insert into public.coesa_articles
        (slug, title, page_title, meta_desc, content, cover_url, cover_alt, keyword, category, status)
      values
        (v_final, p_title, p_page_title, p_meta_desc, p_content, p_cover_url, p_cover_alt, p_keyword, p_category, 'published');
      return v_final;
    exception when unique_violation then
      null;
    end;
  end loop;
  return null;
end;
$$;

create or replace function public.coesa_blog_insert_run_log(
  p_secret text,
  p_keyword text,
  p_status text,
  p_error text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_status not in ('success', 'error') then
    raise exception 'invalid_run_status';
  end if;

  update public.coesa_blog_run_log
  set keyword = p_keyword, status = p_status, error = p_error
  where run_date = current_date and status = 'running';
end;
$$;

revoke all on function public.coesa_blog_claim_run(text) from public, anon, authenticated;
revoke all on function public.coesa_blog_insert_article(text,text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.coesa_blog_insert_run_log(text,text,text,text) from public, anon, authenticated;

grant execute on function public.coesa_blog_claim_run(text) to service_role;
grant execute on function public.coesa_blog_insert_article(text,text,text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.coesa_blog_insert_run_log(text,text,text,text) to service_role;
