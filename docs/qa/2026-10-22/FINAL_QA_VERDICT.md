# Final QA verdict — Ask Bubbles (Buff City Soap) — 22 Oct 2026

## Recommendation: **CONDITIONAL PASS** — with an expedited-approval recommendation for the payroll fix

The branch fixes every authorized defect, introduces no regression on any probe, passes the full suite, typecheck, lint, build and the browser run. It is conditional only on the owner actions listed at the end (none of them is a code defect on this branch). **Ask Bubbles `main` has a live payroll data-integrity defect (F-01) that this branch fixes** — see section 5.

Status: **ON HOLD.** No pull request opened, nothing merged, nothing deployed. No production or historical HR record read or changed.

## 1. Commits
| | SHA |
|---|---|
| Base (`origin/main`) | `3395e8d` |
| **Final feature-branch head** (`claude/lucid-shannon-v79zju`, pushed) | **`2ea0a937355e67902f3992d4961323e6354caf32`** |
| QA baseline before the fix round | `ce03a64` |

Fix-round commits (first-parent): `5e858aa` docs/CI corrections · `25be953` W1 (F-01 payroll `c527329`, F-04 intent `9ffbf5b`) · `2bc638f` W3 (F-11 `95d0224`, F-05 guard tests `cca056e`) · `5ee3298` fixture isolation · `2272c73` W4 (F-03 `614e1fd`, F-07/F-08 `64fd694`) · `dea1646` F-11 follow-up · `55a496a` W2 (spelling `6ad7e59`, F-02 `2d8725b`, F-09 `d2589cb`, F-06 `6c5a14a`) · `a19d32b` F-12 (`e8cdcc8`) · `999ac00` F-03d guard · `cf694d2` X2 guard · `2ea0a93` one test expectation (spelling).

## 2. Tests — exact counts (final head)
| Check | Result | Evidence |
|---|---|---|
| Full suite `npm test` (sequential, alone on the machine) at `2ea0a93` | **10,097 passed · 0 failed · 59 skipped** (10,156) — files 418 passed · 6 skipped (424) — exit 0, 486 s | `evidence/full-suite/Ask-bubbles-full-final.{log,json}` |
| Full suite at `cf694d2` (one run earlier) | 10,096 passed · **1 failed** · 59 skipped — the failure was a capitalised name expectation the spelling decision had missed; fixed by `2ea0a93` (see section 3) | `Ask-bubbles-full.{log,json}` |
| Baseline before QA fixes (`ce03a64`) | 9,726 passed · 0 failed · 59 skipped (9,785) | `evidence/baseline/bubbles-full.log` |
| Skipped tests | **59 skipped tests / 6 skipped files — unchanged from baseline**; all environment-gated (local Supabase stack, live Woven, Performance-Framework source document not in the repo); none is a `.skip` in code; no skipped file differs from `main` | `evidence/baseline/skipped-tests.md` |
| Typecheck `tsc --noEmit` | exit 0 | `Ask-bubbles-tsc.log` |
| Lint `eslint .` at `2ea0a93` | exit 0 — 0 errors, 9 warnings (the same count as `main`) | `Ask-bubbles-eslint-final.log` |
| `next build` (live mode) | exit 0 | `evidence/browser/bubbles-build.log` |
| Local-stack integration (`test:local-stack`, real Postgres + GoTrue + PostgREST) | **22 passed · 3 failed** (25). The 3 are `revocation.local-stack.test.ts` expecting a browser token to read knowledge — deliberately revoked by migration `20261003001000_knowledge_server_only.sql`. **Identical 3 failures on `main` `3395e8d`** (stale test, pre-existing, not run in CI) | `evidence/browser/bubbles-local-stack.log`; `evidence/revocation-check/` |
| Playwright (live build, local stack, seeded accounts) | **9/9 passed** | `evidence/browser/bubbles-playwright.log`, `bubbles-browser.jsonl`, `shots/bubbles-*.png` |
| Regression probes (branch vs `main`) | conversation **48/51** (main 40) · identifiers **17/17** (17) · AC3+AC5 **36/36** (25) · review claims **16/16** (5) — **0 regressions** | `REGRESSION_MATRIX.md`, `evidence/final-probes/` |

New QA test files (all fail-before / pass-after on their own fix, or guards with the same sentences as Sunny's fix): `qa-w1-*`, `qa-w2-*`, `qa-w3-*`, `qa-w4-*`, `qa-f11-*`, `qa-f12-store-reply*.test.ts`, `qa-f03d-dated-name.test.ts`, `qa-x2-warning-level-reversal.test.ts` — net **+371 tests** vs baseline. Counts per group: `TEST_CHANGE_AUDIT.md`.

## 3. Changed expectations (every one; full table in `TEST_CHANGE_AUDIT.md`)
No assertion was deleted, skipped or loosened; no `.skip` / `.only` / `.todo` / timeout was added.
| Test | Change | Justification |
|---|---|---|
| `corrective-action-dm-feedback-e2e.test.ts` test D | `form_date` 2026-10-21 → **2026-10-20**; title reworded | F-03: the "by the 10-15-26 deadline" date is no longer a second incident, so the one incident date dates the form — the expectation Sunny's identical test already has. Still an exact-value assertion |
| `owner-retest-e2e` (14 tests), `corrective-action-warning-level-e2e`, `admin-feedback-oct16-e2e`, `form-intake-qa-2026-10-21`, `exit-form-conversation`, `corrective-action-conversation`, and `corrective-action-warning-level-chat-route` (`2ea0a93`) | expected employee names capitalised → **as typed** (e.g. "Paulyne Test" → "paulyne test") | your decision: keep the manager's spelling unless an exact directory match exists. Case-only; each changed line commented. **Reverses the 9 Oct owner rule in `owner-retest-e2e` — tell the owner** |
| `corrective-action-payroll-e2e.test.ts:296,449,468` | fixture `‹Sunny salon id›` → `loc-264` | that id was Sunny's salon, copied by an earlier port; fixture only |
| `corrective-action-payroll-e2e.test.ts:475,487`, `qa-w3-prior-forms-identity.test.ts:194` | callback wiring | F-11 follow-up signature `(name, locationId)`; no assertion changed |

## 4. Browser and saved-form evidence (Playwright, `evidence/browser/`)
Manager `location_manager` assigned to **Omaha, NE (West Dodge Rd) (Store 264)** and **Kearney, NE (Store 66)**; synthetic employee "pat rivera" (no directory record).
| Test | Result |
|---|---|
| AC4 continuity | "i already told you", reload, "she was late again today": turns 2 and 3 send the open-form key `coaching`; `?c=` id identical after reload; thread and card restored; employee `pat rivera` every turn — PASS |
| AC1 assigned location "kearney" | location `loc-66`, employee kept — PASS |
| AC1 unassigned "grand island" | location stays empty, `needs_location`, employee kept — PASS |
| AC5 location choice | dropdown offers only Store 264 and Store 66; create at `loc-66` → 200; forged `loc-236` → **403** "That store is not on your assignment…" — PASS |
| Saved + read back × 4 | employee `pat rivera`, location `loc-264`, form date `2026-10-15`, warning `['verbal']`; payroll_deduct **`['no']`** for "we will not payroll deduct $25", "don't payroll deduct $25", "the $25 payroll deduction was waived"; **`['yes']`** for "payroll deduct $25" — PASS |

## 5. Remaining defects
| ID | Severity | Where | Description | Action |
|---|---|---|---|---|
| **CRIT-P / F-01** | **Critical — live on `main`** | Bubbles `main` `3395e8d` | Negated or waived payroll deduction recorded as **Yes** (all three sentences; `evidence/final-probes/reviewer-bubbles-main.json` (Ask Bubbles repository)). **Fixed on this branch** | Expedite approval of this branch (or of F-01 alone). Have HR review Corrective Actions saved on `main` whose description negates or waives a deduction. QA did not touch those records |
| LS-2 | Low (stale test) | both `main` and branch | 3 revocation local-stack tests expect browser knowledge reads that a migration revoked | update the 3 expectations to the server-only rule (needs your OK: changes a test expectation) |
| B3 | Low | pre-existing | after a ready card and "i already told you", a one-word "today" ends the intake (picker shown; nothing saved wrongly) | follow-up fix |
| R1 | Low | pre-existing | lower-case name + "what should I do?" → no form suggestion | follow-up fix |
| N5 | Low | pre-existing | global admin's bare "264" with no store question open → intake ends (correctly not read as a store) | follow-up fix (same mechanism as B3) |
| F-10 | Medium (data) | by design | district/region managers cannot file (no district roster — fail-closed, kept by instruction) | provide verified district → store assignments |

No Critical/High defect remains **on the branch**.

## 6. Cross-app isolation (Bubbles)
- Lines added by the branch contain **no Sunny data** (salon names, ids, aliases, district mappings, company names). The single token hit is the word "Lawrence" in `qa-w2-employee-reading.test.ts:69`, a guard asserting that Bubbles does **not** treat it as a store. One copied Sunny fixture id (`‹Sunny salon id›`) was found and replaced (`5ee3298`).
- **0** "salon" literals in added production code; 4 provenance comments (tests only); production comments say "the reference platform" (tenant-isolation guard passes).
- Locations resolve through Bubbles' own `stores/resolver.ts` / `store-confirmation.ts` and authorize through `authorizedLocationIds`; F-12 never infers access from a name or number — unassigned or unknown stores are asked, forged ids get 403 (route probes 8/8, browser).
- `evidence/isolation-check.txt`, `PARITY_REPORT.md` §0.

## 7. Exact remaining actions before release
1. **You:** approve the branch (or F-01 alone) on an expedited basis because `main` records waived/negated deductions as Yes; then open the PR (QA has not).
2. **HR/owner:** decide whether to review existing Bubbles CAs affected by F-01 (manual review — QA will not change historical records).
3. **Owner:** acknowledge that names are now kept as typed (reverses the 9 Oct capitalisation rule encoded in `owner-retest-e2e`).
4. **You (optional, authorization needed):** update the 3 stale revocation local-stack expectations (LS-2); schedule B3/R1/N5.
5. **Data owner:** supply verified district assignments before district managers can file (F-10 stays fail-closed until then).
6. After the PR is opened: CI must be green on the PR head (lint, typecheck, `npm test`).
