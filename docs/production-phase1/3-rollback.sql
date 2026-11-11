-- PHASE 1 ROLLBACK (history only). Restores the 37-row history exactly as it was before Phase 1.
-- Run as `postgres`, one transaction. It REFUSES unless the history is exactly "backup + the two marker rows",
-- so it can never delete a row that tooling recorded later (after Phase 2 has run, use the Phase 2 rollback instead).
begin;

do $$
begin
  if to_regclass('supabase_migrations.schema_migrations_backup_20261019') is null then
    raise exception 'rollback refused: no backup table';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations) <> 39 then
    raise exception 'rollback refused: history does not hold exactly 39 rows';
  end if;
end
$$;

delete from supabase_migrations.schema_migrations
 where version in ('20261015001000', '20261016001000')
   and statements[1] like '-- Recorded as applied by metadata reconciliation 2026-10-19%';

do $$
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 37
     or exists (select * from supabase_migrations.schema_migrations except select * from supabase_migrations.schema_migrations_backup_20261019)
     or exists (select * from supabase_migrations.schema_migrations_backup_20261019 except select * from supabase_migrations.schema_migrations) then
    raise exception 'rollback verification failed: nothing was changed';
  end if;
end
$$;

select count(*) as history_rows_after from supabase_migrations.schema_migrations;   -- expect 37

commit;
-- Only after the owner signs off that Phase 1 is finished or abandoned:
--   drop table supabase_migrations.schema_migrations_backup_20261019;
