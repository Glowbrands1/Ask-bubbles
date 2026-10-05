-- ============================================================================
-- LOCAL STAND-INS FOR SUPABASE AUTH — verification only, never applied remotely
-- ============================================================================
--
-- The migrations reference a handful of Supabase Auth objects. On a real
-- project GoTrue owns them; on the throwaway local cluster used by
-- `verify-migrations.sh` these minimal shapes stand in, with the same column
-- names and types the migrations and RLS policies read:
--
--   auth.users            id, email, email_confirmed_at, banned_until, created_at
--   auth.sessions         id, user_id
--   auth.refresh_tokens   id, user_id (text, as GoTrue stores it), session_id
--   auth.uid()            the `sub` claim of the request JWT, as PostgREST sets it
--   auth.role()           the `role` claim
--
-- Tests impersonate a user with:
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';

create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists auth.sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade
);

create table if not exists auth.refresh_tokens (
  id bigserial primary key,
  user_id text,
  session_id uuid references auth.sessions (id) on delete cascade
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$$;

grant usage on schema auth to postgres, anon, authenticated, service_role;
grant select, references on auth.users to postgres;
grant select, delete on auth.sessions, auth.refresh_tokens to postgres;
grant execute on function auth.uid(), auth.role() to public;
