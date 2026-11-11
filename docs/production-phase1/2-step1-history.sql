-- PHASE 1, STEP B: THE ONLY WRITE. Metadata only: no schema object, no data table, no employee record changes.
-- Run as the `postgres` role, as one transaction. It REFUSES (raises, rolls back, changes nothing) unless the history is exactly as pre-flighted.
-- Effect: a backup copy of the history table, plus two history rows for migrations whose changes already exist in the database.
-- 20261014001000 is deliberately NOT recorded: it is only partly applied.
begin;

do $$
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 37 then
    raise exception 'phase 1 refused: expected exactly 37 history rows';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations
              where version in ('20261014001000', '20261015001000', '20261016001000', '20261017001000')) then
    raise exception 'phase 1 refused: one of the four versions is already recorded';
  end if;
  if to_regclass('supabase_migrations.schema_migrations_backup_20261019') is not null then
    raise exception 'phase 1 refused: the backup table already exists';
  end if;
end
$$;

create table supabase_migrations.schema_migrations_backup_20261019 as table supabase_migrations.schema_migrations;

insert into supabase_migrations.schema_migrations (version, name, statements) values
  ('20261015001000', 'google_review_goals',
   array['-- Recorded as applied by metadata reconciliation 2026-10-19; every statement was verified present. See docs/migration-reconciliation-2026-10-19.md']),
  ('20261016001000', 'google_review_reporting_cutoff',
   array['-- Recorded as applied by metadata reconciliation 2026-10-19; every statement was verified present. See docs/migration-reconciliation-2026-10-19.md']);

do $$
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 39
     or (select count(*) from supabase_migrations.schema_migrations_backup_20261019) <> 37
     or exists (select * from supabase_migrations.schema_migrations_backup_20261019
                except select * from supabase_migrations.schema_migrations) then
    raise exception 'phase 1 verification failed: nothing was changed';
  end if;
end
$$;

select count(*) as history_rows_after, (select count(*) from supabase_migrations.schema_migrations_backup_20261019) as backup_rows
  from supabase_migrations.schema_migrations;   -- expect 39 and 37

commit;
