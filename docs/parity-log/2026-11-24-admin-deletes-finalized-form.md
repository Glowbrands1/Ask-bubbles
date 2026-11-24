# Administrators may delete a finalized form (Ask Bubbles only, for now)

**Date:** 24 Nov 2026. **Status:** Bubbles-only until Pau decides for Ask Sunny.

**Report.** Pau, with a screenshot of the Bubbles Forms Register: "why cant delete?
in bubbles — fix and merge". The row was a finalized Corrective Action ("v4 ·
finalized"); it had no "…" menu, because only drafts could be deleted.

**Cause.** Not a bug: a rule. `deleteInstance` refused anything but a draft, and
the Register offered Delete on drafts only (Draft/Finalized only, port of Ask
Sunny #1307). Asked in the session, Pau chose: **administrators can delete a
finalized form**; nobody else.

**What changed in Bubbles.**

- `DELETE /api/forms/instances/{id}` passes `allowFinalized` for `admin`, `owner`
  and `developer` (`ADMIN_CONSOLE_ROLES`); everyone else with
  `manage_form_records` still gets a 409 on a finalized form.
- A form that was replaced by a newer version (`revised`) is never deleted;
  deleting a finalized revision puts the earlier version back to `finalized`.
- The Register offers Delete on a finalized form to those roles only, with a
  warning in the confirmation. Bulk delete, the demo sweep, the chat and the agent
  loop still delete drafts only (the chat now says only an administrator can
  delete a finalized form, from the Forms Register).
- The deletion record (`form_instance_deletions`) is unchanged and is written for a
  finalized form too, so "who deleted <name>'s form" answers it (replay case
  `nov24-admin-asks-who-deleted-the-finalized-form`). The values go by cascade; the
  finalized-values guard does not stop it because the form is already gone when the
  cascade runs (checked on Postgres 16).

**Why Ask Sunny is not changed in this pull request.** Ask Sunny has the same rule
(`src/lib/forms/instances.ts` refuses a non-draft; the Register offers Delete on
drafts only). The decision was asked and answered for Bubbles, and it loosens
protection of signed HR documents, so it is not carried across without Pau saying
so for Sunny. To port: the same three changes (`allowFinalized` on
`deleteInstance`, the route's role check, the Register's menu and warning) with
the name mapping store ↔ salon, Forms Register ↔ Form Monitoring, and the same
tests with invented names.
