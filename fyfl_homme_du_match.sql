-- FYFL — HOMME DU MATCH AUTOMATIQUE
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Le calcul est fait côté PostgreSQL quand un match passe à "Terminé".

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
create policy "FYFL MVP public read"
on public.fyfl_match_mvp
for select to anon, authenticated
using (true);

drop policy if exists "FYFL MVP admin write" on public.fyfl_match_mvp;
create policy "FYFL MVP admin write"
on public.fyfl_match_mvp
for all to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) = 'enzoadressepro888@gmail.com')
with check (lower(coalesce(auth.jwt() ->> 'email','')) = 'enzoadressepro888@gmail.com');

alter table public.fyfl_match_mvp replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='fyfl_match_mvp'
  ) then
    alter publication supabase_realtime add table public.fyfl_match_mvp;
  end if;
end $$;

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
  goal_count integer;
  assist_count integer;
  best_player text;
  best_goals integer;
  best_assists integer;
  best_rating integer;
begin
  if new.status <> 'Terminé' then
    return new;
  end if;

  -- On recalcule si le match vient de se terminer ou si aucun MVP n'existe encore.
  if old.status is not distinct from new.status
     and exists (select 1 from public.fyfl_match_mvp where match_key = new.match_key) then
    return new;
  end if;

  create temporary table if not exists fyfl_mvp_stats_tmp (
    player_name text primary key,
    goals integer not null default 0,
    assists integer not null default 0
  ) on commit drop;
  truncate fyfl_mvp_stats_tmp;

  for item in select value from jsonb_array_elements(coalesce(new.goals,'[]'::jsonb)) loop
    scorer := nullif(trim(coalesce(item->>'scorer','')), '');
    assister := nullif(trim(coalesce(item->>'assister', item->>'assist', item->>'passeur','')), '');

    if scorer is not null and lower(scorer) <> 'buteur' then
      insert into fyfl_mvp_stats_tmp(player_name,goals)
      values (scorer,1)
      on conflict(player_name) do update set goals=fyfl_mvp_stats_tmp.goals+1;
    end if;

    if assister is not null then
      insert into fyfl_mvp_stats_tmp(player_name,assists)
      values (assister,1)
      on conflict(player_name) do update set assists=fyfl_mvp_stats_tmp.assists+1;
    end if;
  end loop;

  select player_name, goals, assists, (goals*5 + assists*3)
  into best_player, best_goals, best_assists, best_rating
  from fyfl_mvp_stats_tmp
  where goals > 0 or assists > 0
  order by (goals*5 + assists*3) desc, goals desc, assists desc, player_name asc
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
after update of status, goals on public.fyfl_matches
for each row
execute function public.fyfl_calculate_man_of_match();

-- Relance une fois le trigger sur les matchs déjà terminés.
update public.fyfl_matches
set status='Terminé'
where status='Terminé';

revoke all on function public.fyfl_calculate_man_of_match() from public;
