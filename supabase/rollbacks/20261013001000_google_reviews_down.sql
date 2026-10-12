-- ============================================================================
-- ROLLBACK for 20261013001000_google_reviews.sql
-- ============================================================================
--
-- Removes ONLY the objects that migration created. Touches no other table, row,
-- policy, grant or function. DESTRUCTIVE for the Google review data it holds
-- (reviews, sync history, audit, the stored connection): take a backup first if
-- any of it must be kept. Run it as one transaction.
--
--   psql ... -1 -f supabase/rollbacks/20261013001000_google_reviews_down.sql
--
-- Idempotent: safe to run when some or all of the objects are already gone.

drop view if exists public.google_reviews_feed;
drop view if exists public.google_review_location_stats;

drop function if exists public.google_reviews_search(text, smallint, text, timestamptz, timestamptz, boolean, integer, integer);
drop function if exists public.google_review_end_connection(text, text, text);
drop function if exists public.google_review_set_connection(text, text[], text);
drop function if exists public.google_review_clear_link(text, text);
drop function if exists public.google_review_note_location_failure(uuid, uuid, text);
drop function if exists public.google_review_apply_reviews(uuid, uuid, jsonb, boolean);
drop function if exists public.google_review_record_link(text, text, text, text, text, jsonb, text);
drop function if exists public.google_review_finish_run(uuid, text, jsonb, text, text);
drop function if exists public.google_review_claim_run(text, text);

drop table if exists public.google_reviews;
drop table if exists public.google_review_sync_runs;
drop table if exists public.google_review_audit;
drop table if exists public.google_review_locations;
drop table if exists public.google_business_connections;

drop function if exists public.google_reviews_check_location();
drop function if exists public.google_review_audit_guard();
