-- FYFL : authentification pseudo + mot de passe, sans adresse e-mail
-- Les comptes et mots de passe sont stockés dans Supabase.
-- Le mot de passe est hashé côté PostgreSQL avec pgcrypto.

create extension if not exists pgcrypto;

create table if not exists public.fyfl_accounts (
  id uuid primary key default gen_random_uuid(),
  pseudo text not null,
  pseudo_key text generated always as (lower(trim(pseudo))) stored,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fyfl_accounts_pseudo_format check (char_length(trim(pseudo)) between 3 and 20),
  constraint fyfl_accounts_pseudo_unique unique (pseudo_key)
);

create table if not exists public.fyfl_sessions (
  token uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.fyfl_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.fyfl_accounts enable row level security;
alter table public.fyfl_sessions enable row level security;

revoke all on public.fyfl_accounts from anon, authenticated;
revoke all on public.fyfl_sessions from anon, authenticated;

drop function if exists public.fyfl_register(text,text);
create or replace function public.fyfl_register(p_pseudo text, p_password text)
returns table(account_id uuid, pseudo text, session_token uuid)
language plpgsql security definer set search_path=public,extensions
as $$
declare a public.fyfl_accounts; t uuid;
begin
  if p_pseudo is null or not (trim(p_pseudo) ~ '^[A-Za-z0-9_À-ÿ -]{3,20}$') then
    raise exception 'pseudo_invalide';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'mot_de_passe_invalide';
  end if;
  if exists(select 1 from public.fyfl_accounts where pseudo_key=lower(trim(p_pseudo))) then
    raise exception 'pseudo_deja_pris';
  end if;
  insert into public.fyfl_accounts(pseudo,password_hash)
  values(trim(p_pseudo),crypt(p_password,gen_salt('bf')))
  returning * into a;
  insert into public.fyfl_sessions(account_id) values(a.id) returning token into t;
  return query select a.id,a.pseudo,t;
end;
$$;

drop function if exists public.fyfl_login(text,text);
create or replace function public.fyfl_login(p_pseudo text, p_password text)
returns table(account_id uuid, pseudo text, session_token uuid)
language plpgsql security definer set search_path=public,extensions
as $$
declare a public.fyfl_accounts; t uuid;
begin
  select * into a from public.fyfl_accounts
  where pseudo_key=lower(trim(p_pseudo))
    and password_hash=crypt(p_password,password_hash)
  limit 1;
  if a.id is null then raise exception 'identifiants_invalides'; end if;
  insert into public.fyfl_sessions(account_id) values(a.id) returning token into t;
  return query select a.id,a.pseudo,t;
end;
$$;

drop function if exists public.fyfl_session(uuid);
create or replace function public.fyfl_session(p_token uuid)
returns table(account_id uuid, pseudo text)
language plpgsql security definer set search_path=public
as $$
begin
  return query
    update public.fyfl_sessions s
    set last_seen_at=now()
    from public.fyfl_accounts a
    where s.token=p_token and s.account_id=a.id
      and s.created_at > now()-interval '30 days'
    returning a.id,a.pseudo;
end;
$$;

drop function if exists public.fyfl_logout(uuid);
create or replace function public.fyfl_logout(p_token uuid)
returns void language sql security definer set search_path=public
as $$ delete from public.fyfl_sessions where token=p_token; $$;

grant execute on function public.fyfl_register(text,text) to anon, authenticated;
grant execute on function public.fyfl_login(text,text) to anon, authenticated;
grant execute on function public.fyfl_session(uuid) to anon, authenticated;
grant execute on function public.fyfl_logout(uuid) to anon, authenticated;

-- Les commentaires des joueurs sont authentifiés par leur session FYFL.
alter table public.fyfl_comments add column if not exists account_id uuid references public.fyfl_accounts(id) on delete set null;
alter table public.fyfl_comments drop constraint if exists fyfl_comments_user_id_fkey;
drop trigger if exists fyfl_comment_identity_trigger on public.fyfl_comments;
drop policy if exists "FYFL comments authenticated insert" on public.fyfl_comments;

drop function if exists public.fyfl_publish_comment(uuid,text);
create or replace function public.fyfl_publish_comment(p_token uuid,p_text text)
returns setof public.fyfl_comments
language plpgsql security definer set search_path=public
as $$
declare a public.fyfl_accounts;
        c public.fyfl_comments;
begin
  if p_text is null or length(trim(p_text))=0 or length(p_text)>500 then raise exception 'commentaire_invalide'; end if;
  select a0.* into a from public.fyfl_sessions s join public.fyfl_accounts a0 on a0.id=s.account_id
  where s.token=p_token and s.created_at > now()-interval '30 days';
  if a.id is null then raise exception 'session_invalide'; end if;
  insert into public.fyfl_comments(user_id,pseudo,text,account_id)
  values(a.id,a.pseudo,trim(p_text),a.id)
  returning * into c;
  return next c;
end;
$$;
grant execute on function public.fyfl_publish_comment(uuid,text) to anon, authenticated;

-- Les comptes joueurs sont diffusés en direct si leur profil est utilisé ailleurs.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fyfl_accounts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fyfl_accounts;
  END IF;
END $$;
