# Woven: disable an account when Woven says Terminated (28 Nov 2026)

Owner, 28 Nov 2026: "make this automatic for both sunny and bubble".

**Ported from Ask Sunny** (its account lifecycle: `access/apply.ts`,
`apply-run.ts`, `config.ts`, the cron step, migration
`20261006002000_woven_account_lifecycle.sql`): `WOVEN_ACCESS_MODE=apply` with
`WOVEN_ACCESS_APPLY_ACTIONS=DISABLE_TERMINATED` (and the optional
`WOVEN_ACCESS_APPLY_EMPLOYEE_IDS` batch), the run lock and record, the guards,
the database re-checks and the two-layer revocation (profile disabled, then
`revokeAuthAccess`: ban + sessions). Here: migration
`20261128003000_woven_disable_terminated.sql`.

## Left Sunny-only on purpose

- **CREATE_USER, SEND_INVITE, LINK_EXISTING.** Not ported: naming them in
  `WOVEN_ACCESS_APPLY_ACTIONS` refuses the configuration (mode off, with a
  problem message). Ask Bubbles has its own invitation and new-hire flows,
  which this change does not touch; automatic account creation from Woven
  needs Buff City Soap's confirmation of `src/config/company/woven.ts` first.
  The planner still shows CREATE_USER in the preview; the apply step records
  it `skipped` (`not_applied_in_ask_bubbles`).
- **Guards for actions never applied here.** `creates_exceed_batch_limit`,
  `location_moves_exceed_threshold` and `role_changes_exceed_threshold` are
  recorded but do not stop a disable in this app (`NOT_APPLIED_ACTION_GUARDS`):
  team members are auto-provision roles here, so the preview can list many
  people without accounts, and that count would otherwise abort every run.
  Sunny applies CREATE_USER, so the guard rightly blocks there.

## Bubbles-first, to check in Ask Sunny

- **A Terminated employee whose account was never linked.** Sunny links an
  unclassified account by exact email only while the employee is Active
  (LINK_EXISTING), then disables it on Terminated. An account first seen when
  the person is already Terminated is `FLAG_LINK_REVIEW`
  (`email_match_terminated_in_woven`) there and is never disabled. Bubbles'
  production case (an assistant manager terminated on 26 Oct, active account,
  matching email, no link) is exactly that, so Bubbles applies the same
  email-discovery rule at termination, for the disable only
  (`planTerminatedEmailMatch` in `access/plan.ts`; the database stores the link
  as `termination_email_match` in the same transaction). Sunny has the same
  gap; porting it there is a follow-up (not done in this session).
