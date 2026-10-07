-- FYFL — CONFIGURATION SUPABASE COMPLETE / REALTIME
-- À exécuter dans Supabase SQL Editor.
-- IMPORTANT : ce script ne contient aucun mot de passe.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- =========================
-- MATCHS
-- =========================
create table if not exists public.fyfl_matches (
  match_key text primary key,
  group_name text not null,
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
alter table public.fyfl_matches add column if not exists day integer default 1;
alter table public.fyfl_matches add column if not exists home text;
alter table public.fyfl_matches add column if not exists away text;
alter table public.fyfl_matches add column if not exists home_score integer default 0;
alter table public.fyfl_matches add column if not exists away_score integer default 0;
alter table public.fyfl_matches add column if not exists status text default 'À venir';
alter table public.fyfl_matches add column if not exists minute integer default 0;
alter table public.fyfl_matches add column if not exists goals jsonb default '[]'::jsonb;
alter table public.fyfl_matches add column if not exists started_at timestamptz;
alter table public.fyfl_matches add column if not exists updated_at timestamptz default now();
create unique index if not exists fyfl_matches_match_key_unique on public.fyfl_matches(match_key);

alter table public.fyfl_matches enable row level security;
drop policy if exists "FYFL matches public read" on public.fyfl_matches;
create policy "FYFL matches public read" on public.fyfl_matches for select to anon, authenticated using (true);
drop policy if exists "FYFL matches admin insert" on public.fyfl_matches;
create policy "FYFL matches admin insert" on public.fyfl_matches for insert to authenticated
with check (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
drop policy if exists "FYFL matches admin update" on public.fyfl_matches;
create policy "FYFL matches admin update" on public.fyfl_matches for update to authenticated
using (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
drop policy if exists "FYFL matches admin delete" on public.fyfl_matches;
create policy "FYFL matches admin delete" on public.fyfl_matches for delete to authenticated
using (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
alter table public.fyfl_matches replica identity full;

-- =========================
-- PARAMÈTRES DU SITE
-- =========================
create table if not exists public.fyfl_settings (
  id text primary key,
  breaking text not null default '',
  player text not null default 'À déterminer',
  news text not null default '',
  standings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.fyfl_settings(id,breaking,player,news,standings)
values('main','REJOIGNEZ LE DISCORD POUR TOUTE LES INFO !','À déterminer','Les matchs FYFL se joueront les mercredis et les week-ends !','{}'::jsonb)
on conflict(id) do nothing;
alter table public.fyfl_settings enable row level security;
drop policy if exists "FYFL settings public read" on public.fyfl_settings;
create policy "FYFL settings public read" on public.fyfl_settings for select to anon, authenticated using (true);
drop policy if exists "FYFL settings admin write" on public.fyfl_settings;
create policy "FYFL settings admin write" on public.fyfl_settings for all to authenticated
using (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
alter table public.fyfl_settings replica identity full;

-- =========================
-- COMMENTAIRES
-- =========================
create table if not exists public.fyfl_comments (
  id uuid primary key default extensions.gen_random_uuid(),
  pseudo text not null,
  text text not null,
  created_at timestamptz not null default now()
);
alter table public.fyfl_comments add column if not exists pseudo text;
alter table public.fyfl_comments add column if not exists text text;
alter table public.fyfl_comments add column if not exists created_at timestamptz default now();
alter table public.fyfl_comments enable row level security;
drop policy if exists "FYFL comments public read" on public.fyfl_comments;
create policy "FYFL comments public read" on public.fyfl_comments for select to anon, authenticated using (true);
drop policy if exists "FYFL comments public insert" on public.fyfl_comments;
create policy "FYFL comments public insert" on public.fyfl_comments for insert to anon, authenticated with check (length(trim(pseudo)) between 3 and 20 and length(trim(text)) between 1 and 1000);
drop policy if exists "FYFL comments admin delete" on public.fyfl_comments;
create policy "FYFL comments admin delete" on public.fyfl_comments for delete to authenticated
using (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
alter table public.fyfl_comments replica identity full;

-- =========================
-- NOTIFICATIONS
-- =========================
create table if not exists public.fyfl_notifications (
  id uuid primary key default extensions.gen_random_uuid(),
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

-- =========================
-- ÉTAT / MAINTENANCE
-- =========================
create table if not exists public.fyfl_site_status (
  id text primary key default 'main',
  maintenance boolean not null default false,
  message text not null default 'FYFL est actuellement en maintenance.',
  updated_at timestamptz not null default now()
);
insert into public.fyfl_site_status(id) values('main') on conflict(id) do nothing;
alter table public.fyfl_site_status enable row level security;
drop policy if exists "FYFL status public read" on public.fyfl_site_status;
create policy "FYFL status public read" on public.fyfl_site_status for select to anon, authenticated using (true);
drop policy if exists "FYFL status admin write" on public.fyfl_site_status;
create policy "FYFL status admin write" on public.fyfl_site_status for all to authenticated
using (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
alter table public.fyfl_site_status replica identity full;

-- =========================
-- JOURNAL ADMIN
-- =========================
create table if not exists public.fyfl_admin_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  action text not null,
  details text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.fyfl_admin_logs enable row level security;
drop policy if exists "FYFL admin logs read" on public.fyfl_admin_logs;
create policy "FYFL admin logs read" on public.fyfl_admin_logs for select to authenticated
using (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
drop policy if exists "FYFL admin logs insert" on public.fyfl_admin_logs;
create policy "FYFL admin logs insert" on public.fyfl_admin_logs for insert to authenticated
with check (lower(coalesce(auth.jwt()->>'email',''))='enzoadressepro888@gmail.com');
alter table public.fyfl_admin_logs replica identity full;

-- =========================
-- STATS : BUTEURS / PASSEURS
-- =========================
create table if not exists public.fyfl_stats (
  id uuid primary key default extensions.gen_random_uuid(),
  category text not null check (category in ('buteur','passeur')),
  player_name text not null,
  stat_count integer not null default 0 check (stat_count >= 0),
  club text not null default '',
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

-- =========================
-- HOMME DU MATCH
-- =========================
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

-- =========================
-- COMPTES PSEUDO + MOT DE PASSE SANS EMAIL
-- =========================
create table if not exists public.fyfl_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  pseudo text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists fyfl_accounts_pseudo_unique on public.fyfl_accounts(lower(trim(pseudo)));
alter table public.fyfl_accounts enable row level security;
revoke all on public.fyfl_accounts from anon, authenticated;
create or replace function public.fyfl_register_account(p_pseudo text, p_password text)
returns table(pseudo text) language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare clean_pseudo text:=trim(p_pseudo);
begin
 if clean_pseudo !~ '^[A-Za-z0-9_À-ÿ -]{3,20}$' then raise exception 'Pseudo invalide.'; end if;
 if length(p_password)<4 or length(p_password)>100 then raise exception 'Mot de passe invalide.'; end if;
 if exists(select 1 from public.fyfl_accounts a where lower(trim(a.pseudo))=lower(clean_pseudo)) then raise exception 'Ce pseudo est déjà pris.' using errcode='23505'; end if;
 insert into public.fyfl_accounts(pseudo,password_hash) values(clean_pseudo,extensions.crypt(p_password,extensions.gen_salt('bf',12)));
 return query select clean_pseudo;
end $$;
create or replace function public.fyfl_login_account(p_pseudo text, p_password text)
returns table(pseudo text) language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 return query select a.pseudo from public.fyfl_accounts a where lower(trim(a.pseudo))=lower(trim(p_pseudo)) and a.password_hash=extensions.crypt(p_password,a.password_hash) limit 1;
end $$;
revoke all on function public.fyfl_register_account(text,text) from public;
revoke all on function public.fyfl_login_account(text,text) from public;
grant execute on function public.fyfl_register_account(text,text) to anon,authenticated;
grant execute on function public.fyfl_login_account(text,text) to anon,authenticated;

-- =========================
-- REALTIME : TOUTES LES DONNÉES PUBLIQUES / ADMIN
-- =========================

do $$
declare t text;
begin
  foreach t in array array['fyfl_matches','fyfl_settings','fyfl_comments','fyfl_notifications','fyfl_site_status','fyfl_admin_logs','fyfl_stats','fyfl_match_mvp'] loop
    if exists(select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('alter table public.%I replica identity full',t);
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end if;
  end loop;
end $$;

-- =========================
-- TRIGGER MVP : RECALCUL APRÈS CHAQUE MODIFICATION DES BUTS,
-- Y COMPRIS SUR UN MATCH DÉJÀ TERMINÉ.
-- =========================
create or replace function public.fyfl_calculate_man_of_match()
returns trigger language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare item jsonb; scorer text; assister text; best_player text; best_goals integer; best_assists integer; best_rating integer;
begin
 if new.status<>'Terminé' then return new; end if;
 create temporary table if not exists fyfl_mvp_stats_tmp(player_name text primary key,goals integer default 0,assists integer default 0) on commit drop;
 truncate fyfl_mvp_stats_tmp;
 for item in select value from jsonb_array_elements(coalesce(new.goals,'[]'::jsonb)) loop
   scorer:=nullif(trim(coalesce(item->>'scorer','')),'');
   assister:=nullif(trim(coalesce(item->>'assister',item->>'assist',item->>'passeur','')),'');
   if scorer is not null and lower(scorer)<>'buteur' then
     insert into fyfl_mvp_stats_tmp(player_name,goals) values(scorer,1) on conflict(player_name) do update set goals=fyfl_mvp_stats_tmp.goals+1;
   end if;
   if assister is not null then
     insert into fyfl_mvp_stats_tmp(player_name,assists) values(assister,1) on conflict(player_name) do update set assists=fyfl_mvp_stats_tmp.assists+1;
   end if;
 end loop;
 select player_name,goals,assists,(goals*5+assists*3) into best_player,best_goals,best_assists,best_rating
 from fyfl_mvp_stats_tmp where goals>0 or assists>0 order by (goals*5+assists*3) desc,goals desc,assists desc,player_name asc limit 1;
 if best_player is null then delete from public.fyfl_match_mvp where match_key=new.match_key;
 else insert into public.fyfl_match_mvp(match_key,player_name,goals,assists,rating,updated_at) values(new.match_key,best_player,best_goals,best_assists,best_rating,now()) on conflict(match_key) do update set player_name=excluded.player_name,goals=excluded.goals,assists=excluded.assists,rating=excluded.rating,updated_at=now(); end if;
 return new;
end $$;
drop trigger if exists fyfl_match_mvp_trigger on public.fyfl_matches;
create trigger fyfl_match_mvp_trigger after update of status,goals on public.fyfl_matches for each row execute function public.fyfl_calculate_man_of_match();

-- Recalcul des MVP déjà terminés.
update public.fyfl_matches set updated_at=updated_at where status='Terminé';
