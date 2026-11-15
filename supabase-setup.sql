-- A lancer une fois dans Supabase > SQL Editor
create table if not exists ss_players (
  pseudo     text primary key,
  pass_hash  text not null,
  best_ms    integer not null default 0,
  created_at timestamptz default now()
);
alter table ss_players enable row level security;   -- aucun acces direct : tout passe par les fonctions ci-dessous

create or replace function ss_register(p_pseudo text, p_hash text) returns boolean
language plpgsql security definer as $$
begin
  if p_pseudo !~ '^[A-Za-z0-9_-]{3,16}$' or length(p_hash) <> 64 then return false; end if;
  insert into ss_players(pseudo, pass_hash) values (p_pseudo, p_hash);
  return true;
exception when unique_violation then return false;
end $$;

create or replace function ss_login(p_pseudo text, p_hash text) returns boolean
language sql security definer as $$
  select exists(select 1 from ss_players where pseudo = p_pseudo and pass_hash = p_hash)
$$;

create or replace function ss_submit(p_pseudo text, p_hash text, p_ms integer) returns boolean
language plpgsql security definer as $$
begin
  update ss_players set best_ms = greatest(best_ms, p_ms)
   where pseudo = p_pseudo and pass_hash = p_hash and p_ms between 0 and 86400000;
  return found;
end $$;

create or replace function ss_top(p_limit integer default 10) returns table(pseudo text, best_ms integer)
language sql security definer as $$
  select pseudo, best_ms from ss_players where best_ms > 0 order by best_ms desc limit least(p_limit, 100)
$$;

grant execute on function ss_register(text,text), ss_login(text,text), ss_submit(text,text,integer), ss_top(integer) to anon;
