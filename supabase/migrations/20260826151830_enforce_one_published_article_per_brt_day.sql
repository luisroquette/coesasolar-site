-- Incidente 19/08/2026: quatro artigos foram publicados no mesmo dia BRT, mas somente
-- um passou pelo run_log. O claim protege o pipeline oficial; este índice protege também
-- imports, scripts e concorrência fora dele.
--
-- 19/08 fica fora do predicado porque já contém o legado conhecido. A partir de 20/08,
-- a produção foi verificada sem duplicatas antes deste rollout.

do $$
begin
  if exists (
    select 1
    from public.coesa_articles
    where status = 'published'
      and published_at >= timestamptz '2026-08-20 03:00:00+00'
    group by ((published_at at time zone 'America/Sao_Paulo')::date)
    having count(*) > 1
  ) then
    raise exception 'coesa_articles has duplicate published BRT days after the rollout cutoff';
  end if;
end
$$;

create unique index if not exists coesa_articles_one_published_per_brt_day_idx
  on public.coesa_articles (((published_at at time zone 'America/Sao_Paulo')::date))
  where status = 'published'
    and published_at >= timestamptz '2026-08-20 03:00:00+00';

comment on index public.coesa_articles_one_published_per_brt_day_idx is
  'Enforces at most one published Coesa article per America/Sao_Paulo calendar day after 2026-08-19.';
