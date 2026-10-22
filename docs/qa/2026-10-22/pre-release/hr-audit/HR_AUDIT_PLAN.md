# Ask Bubbles — read-only HR audit plan: Corrective Actions possibly saved with a wrong "payroll deduct: Yes"

**Status: plan only. No production record has been retrieved, counted or modified.** Every step below needs the approval named in it. The queries were validated only against a disposable local database with synthetic rows (`VALIDATION.md`).

## 1. Goal and scope

Find Corrective Action Forms in Ask Bubbles on which "Is payroll deduct applicable?" may be **Yes** although the manager said the deduction would not be taken (root cause: `../PAYROLL_DEFECT_ROOT_CAUSE.md`), so HR can confirm each one with the manager and correct it through the normal form process.

- **In scope:** Ask Bubbles only; template `dpoa` (Corrective Action Form); field `payroll_deduct` ticked `yes`; set inside the defect window.
- **Out of scope:** Ask Sunny (production not affected), every other template and field, any automatic change, any data outside Ask Bubbles' database.
- **Window (confirmed from Vercel's deployment history, read-only, 22 Oct 2026):** **2026-10-21 20:55:49 UTC** (production deployment `dpl_Dj3AEwdZqewg5tghmhRCeXoPsdFi` of `11d1728`, PR #63, became ready) **to 2026-10-22 19:00:51 UTC** (production deployment `dpl_qapWgWpjkZjZ3SQk7okAmXUvBm2V` of the fix `e7dd377`, PR #67, became ready). Use `-v window_start='2026-10-21 20:55:49+00' -v window_end='2026-10-22 19:00:51+00'`.

## 2. Principles

1. **Read-only.** Every query runs inside `begin transaction … read only` and ends in `rollback`; nothing in this plan writes to the database.
2. **Least data.** Phase A returns ids, dates, statuses and booleans — no names, no chat text, no form text. Chat text is read only in Phase B, only for approved candidates, and never leaves the secure workstation.
3. **Humans decide.** The re-read in Phase B only ranks forms for review. No record is changed by this audit; corrections go through the app's own revise flow by the form's manager with HR, as a separate, approved action.
4. **Two people.** An operator runs the queries; an HR approver witnesses Phase B and owns the results.
5. **Logged and time-boxed.** Each run is recorded (who, when, which file, row counts). Credentials are removed and extracts deleted when the review closes.

## 3. Roles and approvals

| Role | Who (to be named by you) | Does |
|---|---|---|
| Approver | HR lead + the app owner | Approves Phase A, then Phase B, then any correction |
| Operator | One named engineer with database access | Runs the SQL exactly as approved; no ad-hoc queries |
| Reviewer | HR partner for Buff City Soap | Reviews Phase B results, contacts managers |

| Gate | Approval needed before |
|---|---|
| G0 | Confirm the production deployment window (read deployment history in Vercel; read-only) |
| G1 | Phase A — metadata query |
| G2 | Phase B — reading the source chat of the approved candidates |
| G3 | Any correction of a form (outside this plan) |

## 4. Access controls

- **Connection:** a direct Postgres connection to the Ask Bubbles production database, from the approved workstation only, using a **separate, time-limited credential** created for the audit and revoked afterwards. Do **not** use the app's service key or the Supabase dashboard's shared login.
- **Read-only enforcement (two layers):**
  1. The SQL files open `begin transaction isolation level repeatable read read only` and end with `rollback`.
  2. Recommended: a dedicated role, created by the database owner under G1 (this is a production change and needs your approval):
     ```sql
     create role hr_payroll_audit login password '<generated, 24h>' valid until '<now + 24h>';
     alter role hr_payroll_audit set default_transaction_read_only = on;
     alter role hr_payroll_audit set statement_timeout = '60s';
     grant usage on schema public to hr_payroll_audit;
     grant select on public.form_templates, public.form_instances,
                      public.form_instance_values, public.form_instance_events to hr_payroll_audit;  -- Phase A
     grant select on public.chat_messages to hr_payroll_audit;                                        -- Phase B only, granted at G2
     alter role hr_payroll_audit bypassrls;  -- these tables FORCE row-level security; without it the role sees nothing
     -- afterwards: drop role hr_payroll_audit;
     ```
     Granting `bypassrls` needs a role allowed to grant it; if the hosting plan does not allow that, or you prefer not to create a role, the database owner runs the files inside their read-only transaction, witnessed.
- **Outputs:** written only to an encrypted folder on the approved workstation (`/secure/hr-audit/` in the commands below); never to email, chat, tickets, shared drives or this repository. Phase A output may be shared with HR as ids; Phase B output stays with the Reviewer.
- **Logging:** keep the psql session log (`\o`/`-L`) with the run; Postgres `log_statement` captures the queries server-side if enabled.

## 5. Steps

### Step 0 — confirm the window (G0) — done
Confirmed from the Vercel deployment list (read-only): start 2026-10-21 20:55:49 UTC, end 2026-10-22 19:00:51 UTC (see Scope). Nothing else is needed for G0.

### Step 1 — Phase A: candidates, metadata only (G1)
```bash
psql "$AUDIT_DB_URL" -v window_start='<start>' -v window_end='<end>' \
     -f phase-a-candidates.sql -L /secure/hr-audit/phase-a.log -o /secure/hr-audit/phase-a.txt
```
Returns, per form: id, status, source (chat or manual), location id, creator's role, created/finalized/exported times, who set the Yes (`system` = read from chat; `manager` = ticked or chat-corrected), whether the Action Plan states a deduction, the proposal id, and a **review tier**:
- **A** — Yes set from chat at creation (`filled_by=system`, `manager_statement`): highest prior risk.
- **B** — chat-created form whose Yes was set or changed by an edit (incl. a chat correction).
- **C** — manual form, Yes ticked by a person: low risk (the reader did not set it).

Plus totals: Yes in window, set from chat, finalized, exported. **Expected size: small** (one-day window, Corrective Actions only).

### Step 2 — Phase B: re-read the source chat (G2), tiers A and B only
```bash
psql "$AUDIT_DB_URL" -t -A -v candidate_ids='{<ids from Phase A>}' \
     -f phase-b-source-turns.sql -o /secure/hr-audit/source-turns.json
# in a checkout of the FIXED commit on the same workstation:
mkdir -p src/__qa__ && cp phase-b-reclassify.audit.ts src/__qa__/reclassify.audit.test.ts
AUDIT_IN=/secure/hr-audit/source-turns.json AUDIT_OUT=/secure/hr-audit/flags.json \
  npx vitest run src/__qa__/reclassify.audit.test.ts
rm -rf src/__qa__ /secure/hr-audit/source-turns.json   # the chat text is deleted as soon as it is re-read
```
`flags.json` holds one line per form — id, what the **fixed** reader reads, priority — and **no chat text**:
- **HIGH** — the fixed reader reads **No**: the stored Yes is probably wrong.
- **MEDIUM** — the fixed reader would have **asked**: confirm with the manager.
- **LOW** — the fixed reader also reads **Yes**.
- **MANUAL** — the source chat was not found (deleted conversation, or a form not created from chat).

### Step 3 — human review (Reviewer)
For HIGH, then MEDIUM, then MANUAL: open the form in the Forms Register with normal app permissions, confirm with the manager what was decided, and record the outcome in HR's own case log (form id, outcome, date, reviewer). If the form was exported or signed, HR decides whether the paper copy needs re-issuing. **Any correction is a separate, approved action (G3) through the app's revise flow — never a database edit.** If payroll may have acted on a form, HR checks with payroll.

### Step 4 — close
Revoke the audit role; delete `/secure/hr-audit/` except the HR case log and the session logs HR keeps; record the counts (Phase A totals; HIGH/MEDIUM/LOW/MANUAL) for the incident record.

## 6. What this audit cannot tell you
- Whether a manager **intended** a deduction despite their wording (HIGH is "probably wrong", not "wrong").
- Whether payroll actually deducted anything (outside the app).
- Forms whose source conversation was deleted (MANUAL — needs the manager).
