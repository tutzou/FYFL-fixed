-- FYFL V10 - synchronisation temps réel complète
-- À exécuter une seule fois dans Supabase > SQL Editor.

-- MATCHS
alter table public.fyfl_matches enable row level security;

drop policy if exists "Tout le monde peut voir les matchs" on public.fyfl_matches;
drop policy if exists "Visiteurs peuvent voir les matchs" on public.fyfl_matches;
drop policy if exists "Admin peut ajouter des matchs" on public.fyfl_matches;
drop policy if exists "Admin peut modifier les matchs" on public.fyfl_matches;
drop policy if exists "Admin peut supprimer les matchs" on public.fyfl_matches;

create policy "Tout le monde peut voir les matchs"
on public.fyfl_matches for select
to anon, authenticated using (true);

create policy "Admin peut ajouter des matchs"
on public.fyfl_matches for insert
to authenticated
with check ((auth.jwt() ->> 'email') = 'enzoadressepro888@gmail.com');

create policy "Admin peut modifier les matchs"
on public.fyfl_matches for update
to authenticated
using ((auth.jwt() ->> 'email') = 'enzoadressepro888@gmail.com')
with check ((auth.jwt() ->> 'email') = 'enzoadressepro888@gmail.com');

create policy "Admin peut supprimer les matchs"
on public.fyfl_matches for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'enzoadressepro888@gmail.com');

-- PARAMÈTRES DU SITE
create table if not exists public.fyfl_settings (
  id text primary key,
  breaking text not null default 'REJOIGNEZ LE DISCORD POUR TOUTE LES INFO !',
  player text not null default 'À déterminer',
  news text not null default 'Les matchs FYFL se joueront les mercredis et les week-ends !',
  updated_at timestamptz not null default now()
);

alter table public.fyfl_settings add column if not exists standings jsonb not null default '{}'::jsonb;

alter table public.fyfl_settings enable row level security;
drop policy if exists "FYFL settings public read" on public.fyfl_settings;
drop policy if exists "FYFL settings admin write" on public.fyfl_settings;
create policy "FYFL settings public read" on public.fyfl_settings for select to anon, authenticated using (true);
create policy "FYFL settings admin write" on public.fyfl_settings for all to authenticated
using ((auth.jwt() ->> 'email') = 'enzoadressepro888@gmail.com')
with check ((auth.jwt() ->> 'email') = 'enzoadressepro888@gmail.com');

insert into public.fyfl_settings (id) values ('main') on conflict (id) do nothing;

-- COMMENTAIRES
create table if not exists public.fyfl_comments (
  id uuid primary key default gen_random_uuid(),
  pseudo text not null,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.fyfl_comments enable row level security;
drop policy if exists "FYFL comments public read" on public.fyfl_comments;
drop policy if exists "FYFL comments public insert" on public.fyfl_comments;
create policy "FYFL comments public read" on public.fyfl_comments for select to anon, authenticated using (true);
create policy "FYFL comments public insert" on public.fyfl_comments for insert to anon, authenticated
with check (char_length(text) between 1 and 500);

-- REALTIME
alter table public.fyfl_matches replica identity full;
alter table public.fyfl_settings replica identity full;
alter table public.fyfl_comments replica identity full;

do $$ begin alter publication supabase_realtime add table public.fyfl_matches; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.fyfl_settings; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.fyfl_comments; exception when duplicate_object then null; end $$;
