-- Apply with the Supabase CLI or SQL editor in a NEW project for this installation.

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  meta_desc text,
  content text not null,
  cover_url text,
  keyword text,
  status text not null default 'published' check (status in ('generating', 'published', 'failed')),
  published_at timestamptz not null default now()
);

create index if not exists articles_published_at_idx on public.articles (published_at desc);
create index if not exists articles_status_idx on public.articles (status);

create table if not exists public.blog_run_log (
  id uuid primary key default gen_random_uuid(),
  run_date date unique not null,
  keyword text,
  status text not null check (status in ('running', 'success', 'error')),
  error text,
  created_at timestamptz not null default now()
);

alter table public.articles enable row level security;
alter table public.blog_run_log enable row level security;

drop policy if exists articles_public_read on public.articles;
create policy articles_public_read on public.articles
  for select to anon, authenticated
  using (status = 'published');

-- No policy is needed for blog_run_log. The service role bypasses RLS and is
-- used only by server-side generation routes.
