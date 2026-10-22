-- FORM MONITORING — ADMIN-MANAGED ALL-STORE ACCESS DESIGNATION
--
-- Reading forms is limited to the reader's home store. The only people who read
-- every store's forms are administrator roles (decided from `app_users.role` in
-- code) and the accounts designated here. A designation is keyed to the
-- authenticated account (`app_users.id` = `auth.users.id`), never to a name or
-- email, and is managed by inserting or revoking a row — no deployment needed.
--
-- Additive only: one new table. Nothing existing is altered. Like every forms
-- table it is server-only: RLS enabled AND forced, no policy, every privilege
-- revoked from anon and authenticated.
--
-- DEPLOY ORDER. Apply this BEFORE the code that reads it. Until it is applied
-- the code fails closed: nobody but administrators reads other stores' forms,
-- so both would see only their home store.
--
-- The two seed rows below are DATA, applied only if the account exists. To
-- revoke: update public.forms_all_store_access set revoked_at = now() where
-- app_user_id = '<id>';

create table if not exists public.forms_all_store_access (
  app_user_id uuid primary key references public.app_users (id) on delete cascade,
  reason text not null check (length(reason) between 1 and 500),
  granted_by text not null check (length(granted_by) between 1 and 200),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

comment on table public.forms_all_store_access is
  'Accounts approved to read Form Monitoring across all stores, in addition to administrator roles. Server-only. A row with revoked_at set grants nothing.';

alter table public.forms_all_store_access enable row level security;
alter table public.forms_all_store_access force row level security;
revoke all on public.forms_all_store_access from anon, authenticated;

insert into public.forms_all_store_access (app_user_id, reason, granted_by)
select u.id, 'Approved all-store Form Monitoring access (Delphine Ashworth)', 'migration 20261019001000'
  from public.app_users u where u.id = '4979fa8a-09ae-4b89-ad54-054be3acf6ba'
on conflict (app_user_id) do nothing;

insert into public.forms_all_store_access (app_user_id, reason, granted_by)
select u.id, 'Approved all-store Form Monitoring access (the regional manager)', 'migration 20261019001000'
  from public.app_users u where u.id = '4f085a07-4e36-4ff0-a482-4dfba828b235'
on conflict (app_user_id) do nothing;
