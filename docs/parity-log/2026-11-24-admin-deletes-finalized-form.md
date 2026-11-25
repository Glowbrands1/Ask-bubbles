# Administrators may delete a finalized form (ported to Ask Sunny)

**Date:** 24 Nov 2026. **Status:** ported to Ask Sunny the same day, at Pau's ask (Ask Sunny PR 1320).

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

**Ask Sunny.** It had the same draft-only rule. Pau asked for the same there after
this merged, so it was ported with the name mapping Forms Register ↔ Form Monitoring
(Ask Sunny PR 1320, `docs/parity-log/2026-11-24-admin-deletes-finalized-form.md`
there), with its own replay case on `read_form_deletions` and invented test names.
