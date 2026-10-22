-- FORM MONITORING — A DESIGNATION THAT FOLLOWS WOVEN'S STORE LIST
--
-- Adds `visibility_mode` to the admin-managed designation table:
--   'all'                every store (Delphine, DJ — unchanged; the default, so
--                        every existing row keeps exactly what it had)
--   'woven_affiliations' the person's home store plus the other stores Woven
--                        lists for them, and no others
--
-- Additive: one column with a default, one seed row. Noelle Brigham is designated
-- 'woven_affiliations' (seeded only if the account exists). The code reads the
-- column, so APPLY THIS BEFORE DEPLOYING; until then the code fails closed.

alter table public.forms_all_store_access
  add column if not exists visibility_mode text not null default 'all'
  check (visibility_mode in ('all', 'woven_affiliations'));

comment on column public.forms_all_store_access.visibility_mode is
  'all = every store. woven_affiliations = the home store plus the other stores Woven lists for this person.';

insert into public.forms_all_store_access (app_user_id, reason, granted_by, visibility_mode)
select u.id, 'Approved home store plus her other Woven locations (Noelle Brigham)', 'migration 20261019002000', 'woven_affiliations'
  from public.app_users u where u.id = '0bd60053-423c-46b5-8357-fa7e4b4269f5'
on conflict (app_user_id) do nothing;
