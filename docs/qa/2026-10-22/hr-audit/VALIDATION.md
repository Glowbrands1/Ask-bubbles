# HR audit SQL — validation on synthetic data only

**Where:** a disposable local Postgres 16 + GoTrue stack (`scripts/local-stack/up.sh` of Ask Bubbles at `14c37f3`; the branch changes no migration, so the schema is production's `main` schema). The runner refuses any host but `127.0.0.1`.
**Data:** `validation/seed-synthetic.sql` — 8 invented forms, 3 invented conversations, one invented user. **No production or historical HR record was read.**
**Runner:** `validation/run-validation.sh` (creates the audit role exactly as `HR_AUDIT_PLAN.md` §4 describes, runs Phase A and Phase B **as that role**, re-reads with the fixed reader, tries a write, checks the data is unchanged, tears the stack down). Raw output: `validation/results/`.

## Synthetic cases and results

| Form | Set-up | Expected | Phase A | Phase B |
|---|---|---|---|---|
| 1 | chat-created, finalized + exported, Yes from chat; manager wrote "we will not payroll deduct $25"; Action Plan states "$25 will be deducted…"; a LATER unrelated turn mentions "$50" | candidate, tier A, plan_states_deduction = true; **HIGH** | ✓ tier A, `t` | ✓ **HIGH** (fixed reader: No). Only turns up to the card were read — the later "$50" turn was excluded |
| 2 | chat-created, genuine "payroll deduct $25"; found through `formInstanceRef` (not the proposal) | tier A; **LOW** | ✓ | ✓ **LOW** (Yes) |
| 3 | chat-created, "no need for the $25 payroll deduction"; card inside `formProposals[]` | tier A; **MEDIUM** | ✓ | ✓ **MEDIUM** (would have asked) |
| 4 | manual form, Yes ticked by a person | tier **C**; not re-read | ✓ tier C | — (correctly not a Phase B candidate) |
| 5 | payroll **No** | excluded | ✓ excluded | — |
| 6 | Yes set **before** the window (20 Oct) | excluded | ✓ excluded | — |
| 7 | chat-created, conversation deleted (no messages) | tier A; **MANUAL** | ✓ | ✓ **MANUAL** (source not found) |
| 8 | a **Coaching** form with a Yes value | excluded (not a Corrective Action) | ✓ excluded | — |

Totals row: `yes_in_window 5, set_from_chat 4, finalized 1, exported 1` ✓.

## Controls
| Check | Result |
|---|---|
| Queries run as `hr_payroll_audit` (read-only default, SELECT grants only) | ✓ Phase A and Phase B both exit 0 |
| A write attempted as `hr_payroll_audit` | ✓ refused: `ERROR: cannot execute UPDATE in a read-only transaction` |
| Data after the audit | ✓ unchanged (payroll values: 1 × No, 7 × Yes, as seeded) |
| Phase A output | ids, statuses, dates, booleans only — no names, no chat or form text ✓ |
| Phase B output (`flags.json`) | id, fixed reading, priority — no chat text ✓ (the intermediate `source-turns.json` holds the synthetic chat text and is deleted in the real procedure) |
| The app's own guard | Seeding values onto an already-finalized form was refused by `forms_guard_finalized_values` — the audit never writes, and the database would refuse an edit to a finalized form anyway |

## Not validated (cannot be, without production)
- The real deployment window (audit step 0).
- Whether `bypassrls` can be granted on the hosted database (the plan's fallback: the database owner runs the files read-only, witnessed).
- Query cost on production volumes (expected tiny: Corrective Actions, one-day window; `statement_timeout` is 60 s).
