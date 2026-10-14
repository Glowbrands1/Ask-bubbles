-- ============================================================================
-- ROLLBACK for 20261016001000_google_review_replies.sql
-- ============================================================================
--
-- Removes ONLY the objects that migration created (two tables, their functions). Touches no
-- existing table, row, grant or function: `google_reviews`, its reviewer names, ratings, comments
-- and reply columns are left exactly as they are.
--
-- DESTRUCTIVE for the reply drafts and the publish history it holds (who drafted, who published,
-- when, failures). Take a backup first if that history must be kept. Run as one transaction:
--
--   psql ... -1 -f supabase/rollbacks/20261016001000_google_review_replies_down.sql
--
-- A reply already PUBLISHED to Google stays on Google, and its text stays in
-- `google_reviews.reply_comment` (it mirrors Google, and the next sync would restore it anyway).
-- Roll back the application change first (or leave GOOGLE_REVIEWS_REPLIES_ENABLED off), so nothing
-- calls the functions below while they are being dropped.
--
-- Idempotent: safe to run when some or all of the objects are already gone.

drop function if exists public.google_review_reply_discard(uuid, text);
drop function if exists public.google_review_reply_mark_failed(uuid, text, text);
drop function if exists public.google_review_reply_mark_published(uuid, text, timestamptz, text, boolean);
drop function if exists public.google_review_reply_release_stuck(uuid, text, interval);
drop function if exists public.google_review_reply_claim_publish(uuid, integer, text);
drop function if exists public.google_review_reply_save_draft(uuid, text, text, integer);
drop function if exists public.google_review_replies_open(uuid[]);
drop function if exists public.google_review_reply_context(uuid);
drop function if exists public.google_review_reply_json(public.google_review_replies);

drop table if exists public.google_review_reply_events;
drop table if exists public.google_review_replies;

drop function if exists public.google_review_reply_events_guard();
