-- =============================================================================
-- PLACEHOLDER documenting history entry 20261014114127 "google_reviews_history_columns"
-- =============================================================================
--
-- The Ask Bubbles production database's migration history holds ONE entry with this
-- version and name. It was applied by an administrator directly, not from this
-- repository, and its recorded SQL is exactly the two ALTER TABLE statements below
-- (a single recorded statement string). This file reproduces them so the repository
-- and the history list the same versions. Nothing else.
--
-- WHAT THIS FILE IS NOT
--   * It is NOT the larger 20261014001000_google_reviews_history.sql. That file is a
--     different, 222-line migration (functions, views, a dropped overload). It is NOT
--     recorded as applied anywhere, and nothing in this file implies that it is. On
--     production only part of it exists (see docs/migration-reconciliation-2026-10-19.md).
--   * It adds no behaviour. Every statement is re-runnable (`add column if not exists`).
--     On a fresh database the columns come from 20261014001000 (they are NOT in
--     20261013001000), so this file only does anything on a database that stopped before
--     20261014001000; the live database already has all four columns.
--
-- Fresh databases apply this file after 20261014001000, where it changes nothing.

alter table public.google_reviews add column if not exists reviewer_name text check (reviewer_name is null or length(reviewer_name) <= 200);
alter table public.google_review_locations
  add column if not exists api_total_review_count integer check (api_total_review_count is null or api_total_review_count >= 0),
  add column if not exists api_average_rating numeric(3,2),
  add column if not exists api_total_checked_at timestamptz;
