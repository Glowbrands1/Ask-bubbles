# Final QA verdict — Ask Bubbles (Buff City Soap) — 22 Oct 2026 (after the overnight validation)

> **Superseded by the final safety check:** see `FINAL_RELEASE_RECOMMENDATION.md` (final code heads Sunny `880d19a`, Bubbles `225bf10`, payroll-only `56c45e1`; one more payroll defect fixed — corrections after the form exists).

## Recommendation: **PASS for release — subject to your approval and the owner acknowledgements below.** Expedite: production `main` has a live payroll defect that this branch fixes.

Every release-blocking defect found by QA is fixed and verified; the full suite, typecheck, lint, build, local-stack integration (25/25), Playwright (9/9), payroll and regression probes pass with no regression against `main`. What remains is Low and pre-existing, plus decisions that are yours or the owner's (not code defects).

Status: **ON HOLD.** No pull request, no merge, no deployment. No production or historical HR record read or changed.

## 1. Commits
| | SHA |
|---|---|
| Base (`origin/main`) | `3395e8d` |
| **Final feature-branch head** (`claude/lucid-shannon-v79zju`, pushed) | **`82b34e3`** (+ a docs-only evidence commit on top) |
| Payroll-only option (local branch `qa/bubbles-payroll-only`, **not pushed**) | `483e6b4` (4 commits on `main`) |

Overnight commits (after the previous verdict at `2ea0a93`): `e061750` payroll fail-safe · `72c24be` payroll amount comma · `14c37f3` withdrawn payroll answer · `82b34e3` revocation local-stack test.

## 2. Tests — exact counts at the final head
| Check | Result | Evidence |
|---|---|---|
| Full suite `npm test` (sequential, alone) at `82b34e3` | **10,139 passed · 0 failed · 59 skipped** (10,198); files 419 passed · 6 skipped | `evidence/full-suite/Ask-bubbles-full.{log,json}` |
| Skipped | 59 tests / 6 files — **unchanged since the QA baseline**; all environment-gated | `evidence/baseline/skipped-tests.md` |
| Typecheck | exit 0 | `Ask-bubbles-tsc.log` |
| Lint | exit 0 — 0 errors, 9 warnings (same as `main`) | `Ask-bubbles-eslint.log` |
| `next build` (live mode) | exit 0 | `evidence/browser/bubbles-build.log` |
| Local-stack integration (real Postgres + GoTrue + PostgREST) | **25/25** (was 22/25 on branch and `main`; see fix 4) | `evidence/pre-release/bubbles-revocation-fix-local-stack.log` |
| Playwright, live build, seeded accounts | **9/9** | `evidence/browser/bubbles-*` |
| Regression probes vs `main` | conversation **48/51** (main 40) · identifiers **17/17** (17) · prior coaching + location authorization **36/36** (25) · review claims **16/16** (5) — **0 regressions** | `evidence/final-probes/` |
| Payroll reader, 43 sentences | **0 false Yes, 0 false No**; answers identical to Ask Sunny's on all 43 | `evidence/pre-release/payroll-edge2-*.json` |
| Payroll through the chat, 19 scenarios (No / Yes / ambiguous / multi-turn) | **19/19** (main 8/19) | `evidence/pre-release/payroll-conversation-*.json` |
| HR audit SQL on synthetic data | all 8 synthetic cases classified as expected; read-only enforced; data unchanged | `pre-release/hr-audit/VALIDATION.md` |

## 3. Fixed overnight (each: root cause, fail-before test, both apps unless noted)
| # | Defect | Root cause | Fix | Tests |
|---|---|---|---|---|
| 1 | "we're not doing / skip / no need for / hold off on the $25 payroll deduction", "payroll deduct $25 does not apply" still read **Yes** after the first F-01 fix | An amount beside "payroll deduct" was a Yes unless a fixed list of negative phrasings matched | A Yes read from an amount or a verb is a Yes only when no word beside it denies, waives, cancels or replaces it; otherwise the manager is asked. "…does not apply" is No; a denied waiver is asked | 31; 16 fail on `main` |
| 2 | Action Plan said **"$25, will be deducted…"** | Money pattern took the clause's comma as part of the amount (live on `main`) | Comma only between digit groups | 7; 3 fail before |
| 3 | After a Yes, "actually we're not doing the $25 payroll deduction" left the form and the card kept **Yes** (live on `main`) | Open-form continuation only recognised a payroll turn read as Yes/No | An unclear payroll turn continues the form; the Yes is withdrawn and the card asks | 4; 4 fail before |
| 4 | `revocation.local-stack.test.ts` 3/13 failing since 8 Oct (Bubbles only; not in CI) | The test proved a live session by a direct knowledge read that migration `20261003001000` deliberately closed | Liveness proven through `authorizeRequest` (the app's real path); BEFORE now also asserts knowledge is refused even to an ACTIVE token. **Every termination assertion unchanged** | 25/25 |

## 4. Changed test expectations (complete list: `TEST_CHANGE_AUDIT.md`)
No assertion deleted, skipped or loosened; no `.skip`/`.only`/`.todo`. Since the last verdict, only fix 4 changed existing assertions: three "the session is alive" checks now use the API instead of a closed table read, and one new, stricter assertion was added. Earlier changes (spelling kept as typed — reverses the 9 Oct owner rule; test D form date 10/21→10/20; a copied Sunny fixture id replaced) are unchanged.

## 5. Browser and saved-form evidence (final head, `evidence/browser/`)
Manager `location_manager` at **Omaha, NE (West Dodge Rd) (Store 264)**, also covering **Kearney, NE (Store 66)**; synthetic employee "pat rivera".
- Continuity: "i already told you", reload, next turn — open-form key `coaching` kept, `?c=` kept, thread and card restored, employee kept.
- Location reply "kearney" (assigned) → `loc-66`, employee kept; "grand island" (unassigned) → blank, `needs_location`, employee kept.
- Location choice offers only Store 264 and Store 66; forged `loc-236` → **403**.
- Saved and read back: employee `pat rivera`, location `loc-264`, form date `2026-10-15`, warning `['verbal']`; payroll **`['no']`** for "we will not…", "don't…", "the $25 payroll deduction was waived"; **`['yes']`** for "payroll deduct $25".

## 6. Remaining (none release-blocking)
| ID | Severity | Description | Origin |
|---|---|---|---|
| **CRIT-P** | **Critical — in production** | `main` saves negated/waived deductions as Yes (and the comma and withdrawal defects). **Fixed on this branch and on the payroll-only option; needs release + the HR audit** | `main` |
| B3 | Low | After a ready card and "i already told you", a one-word "today" ends the intake (nothing saved wrongly) | pre-existing |
| R1 | Low | Lower-case name in "…what should I do?" gets no form suggestion | pre-existing |
| N5 | Low | An admin's bare "264" with no store question open ends the intake (correctly not read as a store) | pre-existing |
| P-1 | Low | After a form EXISTS, an unclear payroll statement changes nothing and is not asked about (the form keeps its value; no wrong value is written) — from code reading of `chat-correction.ts`, not probed | pre-existing |
| F-10 | Medium (data) | District managers cannot file (no district roster; fail-closed by your instruction) | by design |

## 7. Cross-company isolation
0 Sunny data in Bubbles code or tests (the one token is "Lawrence" in a guard asserting Bubbles does **not** treat it as a store); 0 "salon" in user-facing strings; Bubbles' own resolver (`stores/resolver.ts`, `store-confirmation.ts`) and authorizer (`authorizedLocationIds`); probes, Playwright and the audit validation used only Bubbles stores (264, 66, 236) and synthetic people. `evidence/isolation-check.txt`.

## 8. Before release (your decisions)
1. **Approve** Option A (payroll-only, smallest change) first, or Option B (this branch) — `pre-release/BUBBLES_PAYROLL_RELEASE_OPTIONS.md`.
2. **Owner acknowledges** names kept as typed (reverses 9 Oct rule) and the date / location / two-person behaviour (Option B only).
3. **HR audit** gates G0–G2 (`pre-release/hr-audit/HR_AUDIT_PLAN.md`).
4. Then: PR, green CI, deploy, post-deploy smoke (`pre-release/RELEASE_CHECKLISTS.md`).
