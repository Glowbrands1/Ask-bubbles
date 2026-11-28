-- ---------------------------------------------------------------------------
-- FLAG_SAME_NAME_ACCOUNT: an unlinked account with the same person's name.
--
-- Pau, 28 Nov 2026: "Ok duplicate check". Someone with an account under a
-- personal email would be given a second account at the email Woven lists.
-- The planner now holds the create when an unlinked, not disabled account
-- carries the same name (case, accents and spacing ignored), for an admin to
-- link or to create. This adds the new action to the run log's vocabulary,
-- and nothing else.
--
-- ADDITIVE ONLY: one CHECK constraint is replaced by a wider one. Production's
-- constraint (checked 28 Nov 2026) lists exactly the actions below minus the
-- new one.
-- ---------------------------------------------------------------------------

alter table public.employee_access_actions drop constraint if exists employee_access_actions_action_check;
alter table public.employee_access_actions add constraint employee_access_actions_action_check
  check (action in (
    'NO_CHANGE', 'CREATE_USER', 'UPDATE_PRIMARY_LOCATION', 'UPDATE_ROLE', 'DISABLE_TERMINATED',
    'FLAG_LINK_REVIEW', 'FLAG_DUPLICATE_EMAIL', 'FLAG_MISSING_EMAIL', 'FLAG_UNMAPPED_POSITION',
    'FLAG_UNMAPPED_LOCATION', 'FLAG_UNKNOWN_STATUS', 'FLAG_REHIRE_REVIEW', 'FLAG_NOT_WOVEN_MANAGED',
    'FLAG_EMAIL_CHANGE_REVIEW', 'FLAG_MISSING_FROM_WOVEN', 'FLAG_ROLE_REVIEW', 'FLAG_LOCATION_REVIEW',
    'FLAG_PROTECTED_ACCOUNT', 'FLAG_LINKED_EMPLOYEE_NOT_FOUND', 'FLAG_STATUS_CONFLICT',
    'FLAG_SAME_NAME_ACCOUNT'
  ));
