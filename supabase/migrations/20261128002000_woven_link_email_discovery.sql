-- ---------------------------------------------------------------------------
-- THE ACCOUNT LIFECYCLE MAY LINK AN ACCOUNT BY ITS ONE EXACT EMAIL MATCH.
--
-- Pau, 28 Nov 2026: "need lifecycle in bubble too". Ask Sunny's lifecycle
-- links an existing account to the one Woven employee with the same email
-- (`email_discovery`); this app's link table only allowed the methods a
-- person or the backfill uses. This adds `email_discovery` to the allowed
-- link methods, and nothing else: the linking itself is
-- `src/lib/admin/woven-lifecycle.ts`, behind WOVEN_ACCESS_APPLY_ACTIONS.
--
-- ADDITIVE ONLY: one CHECK constraint is replaced by a wider one.
-- ---------------------------------------------------------------------------

alter table public.employee_account_links
  drop constraint employee_account_links_link_method_check;

alter table public.employee_account_links
  add constraint employee_account_links_link_method_check
  check (link_method in ('override_backfill', 'unmatched_backfill', 'admin_confirmed_email', 'admin_manual', 'provisioned', 'email_discovery'));
