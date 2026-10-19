# Production rollout checklist (plain language)

Nothing here has been done. Each phase starts only when the named person approves it in writing. If any **STOP** condition happens, stop, do not continue, and use the **Undo** line for that phase.

People you need: a **Supabase project owner** (runs the database steps), a **Vercel project owner** (deploys), a **Buff City Soap administrator** (checks the app), and one **named person at Buff City Soap who will review the daily Woven check** (phase 5).

## Before anything
- [ ] In Supabase, open Database, then Backups. Confirm a recent backup exists. Take a manual one if the plan allows it. **STOP if there is no backup.**
- [ ] Write down the time and who is running each step.

## Phase 1: record two migrations that are already in the database (changes only the record book, not the app)
- [ ] The technical team runs the read-only pre-flight in section 4.2 of `docs/migration-reconciliation-2026-10-19.md`. **STOP if any check says "no".**
- [ ] Run Step 1 (it first saves a copy of the record book, then adds two lines). **STOP if the count afterwards is not 39.**
- Undo: the "Rollback step 1" in that report puts it back to 37 lines. Takes under a minute.

## Phase 2: bring the database up to date (after Phase 1 and the merge of the migration-reconciliation PR #56)
- [ ] Run the **dry run** first (`supabase db push --include-all --dry-run`). It changes nothing. It must list **exactly** these and nothing else: `20261014001000` and `20261017001000`. **STOP if the list is different, shorter or longer.**
- [ ] Run the real push. **STOP if it prints any error.**
- [ ] Check the three after-checks in Step 3 of the report. **STOP if any says false.**
- [ ] A person with permission runs `docs/production-smoke-checklist.md` (health page and the Google Reviews admin screens). **STOP if the health page is not "ok" or a screen errors.**
- Undo: "Rollback step 2" in the report (puts back one old function, removes two record lines). No employee data is involved.

## Phase 3: ship the termination feature switched OFF (after approval to merge PR #54)
- [ ] Confirm the environment setting `WOVEN_TERMINATION_ENFORCEMENT` is **absent or not exactly `on`**. **STOP if it is `on`.**
- [ ] Merge, wait for the Vercel deploy, run the smoke checklist again. **STOP on any error.**
- [ ] Confirm no employee account changed: the Woven admin screen shows nobody disabled by enforcement.
- Undo: Vercel, Deployments, promote the previous deployment (instant). The database part is not applied yet, so nothing else to undo.

## Phase 4: add the termination database objects (separate approval)
- [ ] Dry run must list **exactly** `20261019001000`. **STOP otherwise.**
- [ ] Real push, then the report's checks. The function list must exist and no one can be disabled yet (no reviewer is designated, so the system refuses to act).
- Undo: `supabase/rollbacks/20261019001000_woven_disable_terminated_down.sql` (tested: it returns the database to exactly the state before this step, and it refuses to run if enforcement ever acted). Then delete that migration's line from the record book. Do this with the technical team, not alone.

## Phase 5: designate the daily reviewer (separate approval, needs two administrators)
- [ ] Buff City Soap names the reviewer. The technical team does **not** choose.
- [ ] A second administrator records the designation, with a reason.
- Undo: the designation can be revoked the same way. A review made under a revoked designation is ignored.

## Phase 6: first real enforcement (separate approval, small batch)
- [ ] The reviewer opens the daily shadow run and approves a short list of people **who they have checked against HR records**. Protected accounts (district and regional managers, app-switcher users, administrators) can never be on it.
- [ ] Set `WOVEN_TERMINATION_ENFORCEMENT=on` **and** `WOVEN_TERMINATION_ENFORCEMENT_EMPLOYEE_IDS` to those few people.
- [ ] After the next run, check each person: account disabled, signed out, and the run says `completed`.
- **STOP and set the switch back to anything other than `on` if:** a person who should keep access is disabled, a run says `partial` or `failed`, or the count is higher than the list you approved.
- Undo for one person: an administrator approves a rehire with a written reason (`POST /api/admin/employees/woven/rehire`). Nothing restores access automatically.

## Always true
- Switching enforcement off is instant and safe: set the variable to anything but `on`.
- No step changes employee records except Phase 6, and only for the reviewed list.
