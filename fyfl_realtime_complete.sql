-- ============================================================
-- FYFL — MIGRATION COMPLETE : SUPABASE + REALTIME + STATS + MVP
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
-- Ne supprime ni ne réinitialise les données existantes.
-- ============================================================

-- ---------- MATCHS ----------
create table if not exists public.fyfl_matches (
  match_key text primary key,
  group_name text,
  day integer not null default 1,
  home text not null,
  away text not null,
  home_score integer not null default 0,
  away_score integer not null default 0,
  status text not null default 'À venir',
  minute integer not null default 0,
  goals jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.fyfl_matches add column if not exists group_name text;
alter table public.fyfl_matches add column if not exists day integer not null default 1;
alter table public.fyfl_matches add column if not exists home text;
alter table public.fyfl_matches add column if not exists away text;
alter table public.fyfl_matches add column if not exists home_score integer not null default 0;
alter table public.fyfl_matches add column if not exists away_score integer not null default 0;
alter table public.fyfl_matches add column if not exists status text not null default 'À venir';
alter table public.fyfl_matches add column if not exists minute integer not null default 0;
alter table public.fyfl_matches add column if not exists goals jsonb not null default '[]'::jsonb;
alter table public.fyfl_matches add column if not exists started_at timestamptz;
alter table public.fyfl_matches add column if not exists updated_at timestamptz not null default now();
alter table public.fyfl_matches enable row level security;
drop policy if exists "FYFL matches public read" on public.fyfl_matches;
create policy "FYFL matches public read" on public.fyfl_matches for select to anon, authenticated using (true);
drop policy if exists "FYFL matches admin write" on public.fyfl_matches;
create policy "FYFL matches admin write" on public.fyfl_matches for all to authenticated
using (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
alter table public.fyfl_matches replica identity full;

-- ---------- PARAMÈTRES ----------
create table if not exists public.fyfl_settings (
  id text primary key,
  breaking text default '',
  player text default '',
  news text default '',
  standings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.fyfl_settings add column if not exists breaking text default '';
alter table public.fyfl_settings add column if not exists player text default '';
alter table public.fyfl_settings add column if not exists news text default '';
alter table public.fyfl_settings add column if not exists standings jsonb not null default '{}'::jsonb;
alter table public.fyfl_settings add column if not exists updated_at timestamptz not null default now();
alter table public.fyfl_settings enable row level security;
drop policy if exists "FYFL settings public read" on public.fyfl_settings;
create policy "FYFL settings public read" on public.fyfl_settings for select to anon, authenticated using (true);
drop policy if exists "FYFL settings admin write" on public.fyfl_settings;
create policy "FYFL settings admin write" on public.fyfl_settings for all to authenticated
using (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
insert into public.fyfl_settings(id) values('main') on conflict(id) do nothing;
alter table public.fyfl_settings replica identity full;

-- ---------- COMMENTAIRES ----------
create table if not exists public.fyfl_comments (
  id uuid primary key default gen_random_uuid(),
  pseudo text not null,
  text text not null,
  created_at timestamptz not null default now()
);
alter table public.fyfl_comments enable row level security;
drop policy if exists "FYFL comments public read" on public.fyfl_comments;
create policy "FYFL comments public read" on public.fyfl_comments for select to anon, authenticated using (true);
drop policy if exists "FYFL comments authenticated insert" on public.fyfl_comments;
create policy "FYFL comments authenticated insert" on public.fyfl_comments for insert to anon, authenticated with check (true);
alter table public.fyfl_comments replica identity full;

-- ---------- NOTIFICATIONS ----------
create table if not exists public.fyfl_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.fyfl_notifications enable row level security;
drop policy if exists "FYFL notifications public read" on public.fyfl_notifications;
create policy "FYFL notifications public read" on public.fyfl_notifications for select to anon, authenticated using (true);
drop policy if exists "FYFL notifications admin insert" on public.fyfl_notifications;
create policy "FYFL notifications admin insert" on public.fyfl_notifications for insert to authenticated
with check (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
alter table public.fyfl_notifications replica identity full;

-- ---------- MAINTENANCE ----------
create table if not exists public.fyfl_site_status (
  id text primary key,
  maintenance boolean not null default false,
  message text not null default '🔧 FYFL est actuellement en maintenance.\n\nLe site revient bientôt.',
  updated_at timestamptz not null default now()
);
insert into public.fyfl_site_status(id) values('main') on conflict(id) do nothing;
alter table public.fyfl_site_status enable row level security;
drop policy if exists "FYFL site status public read" on public.fyfl_site_status;
create policy "FYFL site status public read" on public.fyfl_site_status for select to anon, authenticated using (true);
drop policy if exists "FYFL site status admin write" on public.fyfl_site_status;
create policy "FYFL site status admin write" on public.fyfl_site_status for all to authenticated
using (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
alter table public.fyfl_site_status replica identity full;

-- ---------- JOURNAL ADMIN ----------
create table if not exists public.fyfl_admin_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  details text default '',
  created_by text default '',
  created_at timestamptz not null default now()
);
alter table public.fyfl_admin_logs enable row level security;
drop policy if exists "FYFL admin logs public read" on public.fyfl_admin_logs;
create policy "FYFL admin logs public read" on public.fyfl_admin_logs for select to authenticated using (true);
drop policy if exists "FYFL admin logs admin insert" on public.fyfl_admin_logs;
create policy "FYFL admin logs admin insert" on public.fyfl_admin_logs for insert to authenticated
with check (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
alter table public.fyfl_admin_logs replica identity full;

-- ---------- STATS ----------
create table if not exists public.fyfl_stats (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('buteur','passer')),
  player_name text not null,
  count integer not null default 0 check (count >= 0),
  club text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.fyfl_stats enable row level security;
drop policy if exists "FYFL stats public read" on public.fyfl_stats;
create policy "FYFL stats public read" on public.fyfl_stats for select to anon, authenticated using (true);
drop policy if exists "FYFL stats admin write" on public.fyfl_stats;
create policy "FYFL stats admin write" on public.fyfl_stats for all to authenticated
using (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
alter table public.fyfl_stats replica identity full;

-- ---------- HOMME DU MATCH ----------
create table if not exists public.fyfl_match_mvp (
  match_key text primary key,
  player_name text not null,
  goals integer not null default 0,
  assists integer not null default 0,
  rating integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.fyfl_match_mvp enable row level security;
drop policy if exists "FYFL MVP public read" on public.fyfl_match_mvp;
create policy "FYFL MVP public read" on public.fyfl_match_mvp for select to anon, authenticated using (true);
drop policy if exists "FYFL MVP admin write" on public.fyfl_match_mvp;
create policy "FYFL MVP admin write" on public.fyfl_match_mvp for all to authenticated
using (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
alter table public.fyfl_match_mvp replica identity full;

-- ---------- REALTIME : TOUTES LES DONNÉES PARTAGÉES ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fyfl_matches','fyfl_settings','fyfl_comments','fyfl_notifications',
    'fyfl_site_status','fyfl_admin_logs','fyfl_stats','fyfl_match_mvp'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('alter publication supabase_realtime add table public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ---------- MVP AUTOMATIQUE ----------
create or replace function public.fyfl_calculate_man_of_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  scorer text;
  assister text;
  best_player text;
  best_goals integer;
  best_assists integer;
  best_rating integer;
begin
  if new.status <> 'Terminé' then return new; end if;
  if old.status is not distinct from new.status
     and old.goals is not distinct from new.goals
     and exists (select 1 from public.fyfl_match_mvp where match_key=new.match_key) then
    return new;
  end if;
  create temporary table if not exists fyfl_mvp_stats_tmp (
    player_name text primary key,
    goals integer not null default 0,
    assists integer not null default 0
  ) on commit drop;
  truncate fyfl_mvp_stats_tmp;
  for item in select value from jsonb_array_elements(coalesce(new.goals,'[]'::jsonb)) loop
    scorer:=nullif(trim(coalesce(item->>'scorer','')),'');
    assister:=nullif(trim(coalesce(item->>'assister',item->>'assist',item->>'passeur','')),'');
    if scorer is not null and lower(scorer)<>'buteur' then
      insert into fyfl_mvp_stats_tmp(player_name,goals) values(scorer,1)
      on conflict(player_name) do update set goals=fyfl_mvp_stats_tmp.goals+1;
    end if;
    if assister is not null then
      insert into fyfl_mvp_stats_tmp(player_name,assists) values(assister,1)
      on conflict(player_name) do update set assists=fyfl_mvp_stats_tmp.assists+1;
    end if;
  end loop;
  select player_name,goals,assists,(goals*5+assists*3)
  into best_player,best_goals,best_assists,best_rating
  from fyfl_mvp_stats_tmp
  where goals>0 or assists>0
  order by (goals*5+assists*3) desc,goals desc,assists desc,player_name asc
  limit 1;
  if best_player is not null then
    insert into public.fyfl_match_mvp(match_key,player_name,goals,assists,rating,updated_at)
    values(new.match_key,best_player,best_goals,best_assists,best_rating,now())
    on conflict(match_key) do update set
      player_name=excluded.player_name,
      goals=excluded.goals,
      assists=excluded.assists,
      rating=excluded.rating,
      updated_at=now();
  else
    delete from public.fyfl_match_mvp where match_key=new.match_key;
  end if;
  return new;
end;
$$;

drop trigger if exists fyfl_match_mvp_trigger on public.fyfl_matches;
create trigger fyfl_match_mvp_trigger
after update of status,goals on public.fyfl_matches
for each row execute function public.fyfl_calculate_man_of_match();

-- Recalculer les MVP déjà présents après installation.
update public.fyfl_matches set goals=coalesce(goals,'[]'::jsonb) where status='Terminé';

-- ============================================================
-- COMPTES FYFL : pseudo unique + connexion multi-appareils
-- La connexion utilisateur passe par Supabase Auth.
-- L'application utilise un email technique déterministe afin que
-- l'utilisateur puisse se connecter uniquement avec pseudo + mot de passe.
-- Dans Supabase Dashboard : Authentication > Providers > Email
-- => désactiver Confirm email si aucun email réel n'est demandé.
-- ============================================================
create table if not exists public.fyfl_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  pseudo text not null,
  pseudo_key text generated always as (lower(trim(pseudo))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fyfl_profiles_pseudo_format check (char_length(trim(pseudo)) between 3 and 20),
  constraint fyfl_profiles_pseudo_key_unique unique (pseudo_key)
);
alter table public.fyfl_profiles enable row level security;
drop policy if exists "FYFL profiles own read" on public.fyfl_profiles;
create policy "FYFL profiles own read" on public.fyfl_profiles for select to authenticated using (user_id=auth.uid());
drop policy if exists "FYFL profiles own update" on public.fyfl_profiles;
create policy "FYFL profiles own update" on public.fyfl_profiles for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
alter table public.fyfl_profiles replica identity full;

create or replace function public.fyfl_create_profile_from_auth()
returns trigger language plpgsql security definer set search_path=public
as $$
declare p text;
begin
  p:=nullif(trim(coalesce(new.raw_user_meta_data->>'pseudo','')),'');
  if p is not null then
    insert into public.fyfl_profiles(user_id,pseudo)
    values(new.id,p)
    on conflict (user_id) do update set pseudo=excluded.pseudo,updated_at=now();
  end if;
  return new;
end $$;
drop trigger if exists fyfl_auth_profile_trigger on auth.users;
create trigger fyfl_auth_profile_trigger after insert or update of raw_user_meta_data on auth.users
for each row execute function public.fyfl_create_profile_from_auth();

-- Sécurise aussi les commentaires : impossible de publier sous le pseudo d'un autre compte.
alter table public.fyfl_comments add column if not exists user_id uuid references auth.users(id) on delete set null;
create or replace function public.fyfl_set_comment_identity()
returns trigger language plpgsql security definer set search_path=public
as $$
declare p text;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  new.user_id:=auth.uid();
  select pseudo into p from public.fyfl_profiles where user_id=auth.uid();
  if p is null then raise exception 'Profil FYFL introuvable'; end if;
  new.pseudo:=p;
  return new;
end $$;
drop trigger if exists fyfl_comment_identity_trigger on public.fyfl_comments;
create trigger fyfl_comment_identity_trigger before insert on public.fyfl_comments
for each row execute function public.fyfl_set_comment_identity();
drop policy if exists "FYFL comments authenticated insert" on public.fyfl_comments;
create policy "FYFL comments authenticated insert" on public.fyfl_comments for insert to authenticated
with check (user_id=auth.uid());

-- Le profil est partagé en Realtime pour que le pseudo affiché reste cohérent sur les appareils.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fyfl_profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fyfl_profiles;
  END IF;
END $$;
drop policy if exists "FYFL comments authenticated insert" on public.fyfl_comments;
