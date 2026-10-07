-- FYFL : Journal administrateur + état du site + maintenance + Realtime
-- À exécuter dans Supabase SQL Editor.

create table if not exists public.fyfl_site_status (
  id text primary key default 'main',
  maintenance boolean not null default false,
  message text not null default '🔧 FYFL est actuellement en maintenance.\n\nLe site revient bientôt.',
  updated_at timestamptz not null default now()
);

insert into public.fyfl_site_status (id, maintenance, message)
values ('main', false, '🔧 FYFL est actuellement en maintenance.\n\nLe site revient bientôt.')
on conflict (id) do nothing;

alter table public.fyfl_site_status enable row level security;
drop policy if exists "FYFL site status public read" on public.fyfl_site_status;
create policy "FYFL site status public read"
on public.fyfl_site_status for select to anon, authenticated using (true);

drop policy if exists "FYFL site status admin write" on public.fyfl_site_status;
create policy "FYFL site status admin write"
on public.fyfl_site_status for all to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) = 'enzoadressepro888@gmail.com')
with check (lower(coalesce(auth.jwt() ->> 'email','')) = 'enzoadressepro888@gmail.com');

alter table public.fyfl_site_status replica identity full;

create table if not exists public.fyfl_admin_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  details text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.fyfl_admin_logs enable row level security;
drop policy if exists "FYFL admin logs public read" on public.fyfl_admin_logs;
create policy "FYFL admin logs public read"
on public.fyfl_admin_logs for select to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) = 'enzoadressepro888@gmail.com');

drop policy if exists "FYFL admin logs admin insert" on public.fyfl_admin_logs;
create policy "FYFL admin logs admin insert"
on public.fyfl_admin_logs for insert to authenticated
with check (lower(coalesce(auth.jwt() ->> 'email','')) = 'enzoadressepro888@gmail.com');

alter table public.fyfl_admin_logs replica identity full;

-- Realtime pour maintenance + journal.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='fyfl_site_status') then
    alter publication supabase_realtime add table public.fyfl_site_status;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='fyfl_admin_logs') then
    alter publication supabase_realtime add table public.fyfl_admin_logs;
  end if;
end $$;
