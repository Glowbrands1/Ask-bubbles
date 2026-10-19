-- PHASE 1, STEP A: READ-ONLY PRE-FLIGHT. Writes nothing. Run first; every row must say ok = true.
-- (Same checks as "Step 0" in docs/migration-reconciliation-2026-10-19.md, as one result table.)
with c(n, check_name, ok) as (values
  ( 1, 'history has exactly 37 entries',
       (select count(*) = 37 from supabase_migrations.schema_migrations)),
  ( 2, 'none of 20261014001000, 20261015001000, 20261016001000, 20261017001000 is recorded',
       (select count(*) = 0 from supabase_migrations.schema_migrations
         where version in ('20261014001000', '20261015001000', '20261016001000', '20261017001000'))),
  ( 3, 'the backup table does not exist yet',
       (to_regclass('supabase_migrations.schema_migrations_backup_20261019') is null)),
  ( 4, 'goal rows equal store rows (7 = 7 today)',
       (select (select count(*) from public.google_review_goals) = (select count(*) from public.google_review_locations))),
  ( 5, 'google_review_goals.count_from exists (20261016001000 is applied)',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'google_review_goals' and column_name = 'count_from')),
  ( 6, 'two google_review_apply_reviews overloads (the leftover one is why 20261014001000 is NOT recorded)',
       (select count(*) = 2 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'google_review_apply_reviews')),
  ( 7, 'links guard function exists, owned by postgres, not security definer',
       exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.employee_account_links_guard_update()')
                 and pg_get_userbyid(p.proowner) = 'postgres' and not p.prosecdef)),
  ( 8, 'links guard trigger present and enabled',
       exists (select 1 from pg_trigger where tgrelid = 'public.employee_account_links'::regclass
                 and tgname = 'employee_account_links_guard_update' and tgenabled = 'O')),
  ( 9, 'audit list holds managed_flags_changed and credentials_reset',
       exists (select 1 from pg_constraint where conname = 'app_user_audit_action_check'
                 and pg_get_constraintdef(oid) like '%managed_flags_changed%' and pg_get_constraintdef(oid) like '%credentials_reset%')),
  (10, 'service_role may update exactly the three managed flags (column grants)',
       has_column_privilege('service_role', 'public.employee_account_links', 'managed_status', 'UPDATE')
       and has_column_privilege('service_role', 'public.employee_account_links', 'managed_location', 'UPDATE')
       and has_column_privilege('service_role', 'public.employee_account_links', 'managed_role', 'UPDATE')),
  (11, 'auth_clear_user_credentials exists',
       to_regprocedure('public.auth_clear_user_credentials(uuid)') is not null),
  (12, 'employee_account_links is owned by postgres (the migration role)',
       (select pg_get_userbyid(relowner) = 'postgres' from pg_class where oid = 'public.employee_account_links'::regclass)),
  (13, 'the termination migration is NOT in history (nothing from PR #54 is recorded)',
       (select count(*) = 0 from supabase_migrations.schema_migrations where version >= '20261018'))
)
select n, check_name, ok from c
union all
select 99, 'ALL CHECKS OK', bool_and(ok) from c
order by 1;
