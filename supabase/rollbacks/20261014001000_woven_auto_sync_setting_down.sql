-- ============================================================================
-- ROLLBACK for 20261014001000_woven_auto_sync_setting.sql
-- ============================================================================
--
-- Removes ONLY the Auto Sync setting objects. The employee directory, runs and
-- every other table are untouched. After this, the cron route (new code) fails
-- closed and starts nothing, because it cannot read the setting. Run as one
-- transaction. Idempotent.
--
--   psql ... -1 -f supabase/rollbacks/20261014001000_woven_auto_sync_setting_down.sql

drop function if exists public.employee_sync_set_auto(boolean, text);
drop table if exists public.employee_sync_setting_audit;
drop function if exists public.employee_sync_setting_audit_guard();
drop table if exists public.employee_sync_settings;
