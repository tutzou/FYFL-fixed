-- FYFL V14 - correction schéma fyfl_matches
-- Le site utilise maintenant home_score / away_score, conformément à la table créée au départ.
-- Si ta table avait été créée avec hs / as, ces colonnes sont renommées automatiquement.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fyfl_matches' AND column_name='hs')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fyfl_matches' AND column_name='home_score') THEN
    ALTER TABLE public.fyfl_matches RENAME COLUMN hs TO home_score;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fyfl_matches' AND column_name='as')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fyfl_matches' AND column_name='away_score') THEN
    ALTER TABLE public.fyfl_matches RENAME COLUMN "as" TO away_score;
  END IF;
END $$;

-- FYFL V14 - synchronisation temps réel complète
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


-- ============================================================
-- FYFL V14 - REMISE À ZÉRO DU CLASSEMENT ET DES MATCHS
-- À exécuter UNE FOIS après la mise à jour du site.
-- Résultats conservés :
--   Rennes 9-2 Chelsea
--   Manchester City 7-0 Bayern Munich
-- Tous les autres matchs sont remis "À venir".
-- ============================================================

delete from public.fyfl_matches;

insert into public.fyfl_matches
  (match_key, group_name, day, home, away, home_score, away_score, status, minute, goals, started_at, updated_at)
values
  ('A|1|ASTON VILLA|OM', 'A', 1, 'ASTON VILLA', 'OM', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('A|1|BAYER LEVERKUSEN|NEWCASTLE', 'A', 1, 'BAYER LEVERKUSEN', 'NEWCASTLE', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('A|2|ASTON VILLA|BAYER LEVERKUSEN', 'A', 2, 'ASTON VILLA', 'BAYER LEVERKUSEN', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('A|2|OM|NEWCASTLE', 'A', 2, 'OM', 'NEWCASTLE', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('A|3|ASTON VILLA|NEWCASTLE', 'A', 3, 'ASTON VILLA', 'NEWCASTLE', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('A|3|OM|BAYER LEVERKUSEN', 'A', 3, 'OM', 'BAYER LEVERKUSEN', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('B|1|BARCELONE|BESIKTAS', 'B', 1, 'BARCELONE', 'BESIKTAS', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('B|1|LIVERPOOL|REAL MADRID', 'B', 1, 'LIVERPOOL', 'REAL MADRID', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('B|2|BARCELONE|LIVERPOOL', 'B', 2, 'BARCELONE', 'LIVERPOOL', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('B|2|BESIKTAS|REAL MADRID', 'B', 2, 'BESIKTAS', 'REAL MADRID', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('B|3|BARCELONE|REAL MADRID', 'B', 3, 'BARCELONE', 'REAL MADRID', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('B|3|BESIKTAS|LIVERPOOL', 'B', 3, 'BESIKTAS', 'LIVERPOOL', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('C|1|CRYSTAL PALACE|PSG', 'C', 1, 'CRYSTAL PALACE', 'PSG', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('C|1|ATLETICO MADRID|JUVENTUS', 'C', 1, 'ATLETICO MADRID', 'JUVENTUS', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('C|2|CRYSTAL PALACE|ATLETICO MADRID', 'C', 2, 'CRYSTAL PALACE', 'ATLETICO MADRID', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('C|2|PSG|JUVENTUS', 'C', 2, 'PSG', 'JUVENTUS', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('C|3|CRYSTAL PALACE|JUVENTUS', 'C', 3, 'CRYSTAL PALACE', 'JUVENTUS', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('C|3|PSG|ATLETICO MADRID', 'C', 3, 'PSG', 'ATLETICO MADRID', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('D|1|AS MONACO|LAZIO FC', 'D', 1, 'AS MONACO', 'LAZIO FC', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('D|1|D2T|FIORENTINA', 'D', 1, 'D2T', 'FIORENTINA', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('D|2|AS MONACO|D2T', 'D', 2, 'AS MONACO', 'D2T', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('D|2|LAZIO FC|FIORENTINA', 'D', 2, 'LAZIO FC', 'FIORENTINA', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('D|3|AS MONACO|FIORENTINA', 'D', 3, 'AS MONACO', 'FIORENTINA', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('D|3|LAZIO FC|D2T', 'D', 3, 'LAZIO FC', 'D2T', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('E|1|INTER MILAN|RED STAR', 'E', 1, 'INTER MILAN', 'RED STAR', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('E|1|ARSENAL|AC MILAN', 'E', 1, 'ARSENAL', 'AC MILAN', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('E|2|INTER MILAN|ARSENAL', 'E', 2, 'INTER MILAN', 'ARSENAL', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('E|2|RED STAR|AC MILAN', 'E', 2, 'RED STAR', 'AC MILAN', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('E|3|INTER MILAN|AC MILAN', 'E', 3, 'INTER MILAN', 'AC MILAN', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('E|3|RED STAR|ARSENAL', 'E', 3, 'RED STAR', 'ARSENAL', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('F|1|RENNES|CHELSEA', 'F', 1, 'RENNES', 'CHELSEA', 9, 2, 'Terminé', 90, '[]'::jsonb, NULL, now()),
  ('F|1|MANCHESTER CITY|BAYERN MUNICH', 'F', 1, 'MANCHESTER CITY', 'BAYERN MUNICH', 7, 0, 'Terminé', 90, '[]'::jsonb, NULL, now()),
  ('F|2|RENNES|MANCHESTER CITY', 'F', 2, 'RENNES', 'MANCHESTER CITY', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('F|2|CHELSEA|BAYERN MUNICH', 'F', 2, 'CHELSEA', 'BAYERN MUNICH', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('F|3|RENNES|BAYERN MUNICH', 'F', 3, 'RENNES', 'BAYERN MUNICH', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now()),
  ('F|3|CHELSEA|MANCHESTER CITY', 'F', 3, 'CHELSEA', 'MANCHESTER CITY', 0, 0, 'À venir', 90, '[]'::jsonb, NULL, now());

update public.fyfl_settings
set standings='{}'::jsonb, updated_at=now()
where id='main';
