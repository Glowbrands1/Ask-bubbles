# Ask Bubbles — payroll-only release vs the full tested branch (decision aid; nothing deployed)

## The two options

| | **Option A — payroll-only** | **Option B — full feature branch** |
|---|---|---|
| Branch | `qa/bubbles-payroll-only` at `483e6b4` — **local only, not pushed** (needs your permission); the same 4 commits as patches in `bubbles-payroll-only/*.patch` | `claude/lucid-shannon-v79zju` at `82b34e3` (pushed) |
| Base | Bubbles `main` `3395e8d` | Bubbles `main` `3395e8d` |
| Commits | 4: `4df6fbb` F-01 negation/waiver · `2897163` fail-safe (deny-beside-amount) · `711f893` amount comma · `483e6b4` withdrawn answer | 33 (incl. merges): parity ports, docs/CI, W1–W4, F-11, F-12, F-03d, X2, the same 4 payroll fixes, the revocation test, QA evidence |
| Production code changed | **2 files**: `src/lib/forms/payroll-deduct.ts` (reader), `src/lib/ai/form-proposal.ts` (+9 lines: an unclear payroll turn keeps the open form) | **22 files** (+1,246 / −127) across the forms intake, proposal, CA policy, dates, prior forms, location scope, store confirmation, template intent, payroll, draft route, chat UI |
| Tests added | 3 files, 78 tests | +413 vs the QA baseline (9,785 → 10,198) |
| Fixes | The live payroll defects only: negated/waived/cancelled deduction saved as Yes; "$25," on the Action Plan; a withdrawn Yes left on the card | The above **plus** F-02 store reply overwriting the employee, F-03 dates, F-04 "write a…", F-06 two people, F-07/F-08 prior coaching, F-09 role before the name, F-11 prior forms across stores, F-12 store reply ending the intake, typed spelling kept, X2, F-03d, the cross-company fixture, the stale revocation test |
| Manager-visible change | Payroll only: unclear wording is asked instead of answered | Many: date questions, store replies, two-person cards, names kept as typed (reverses the 9 Oct owner rule), prior-form "possible match" notes |

## Validation (final heads)

| Check | Option A `483e6b4` | Option B `82b34e3` |
|---|---|---|
| Full suite (sequential, alone) | **9,793 passed · 0 failed · 59 skipped** (`evidence/full-suite/bubbles-payroll-only-full.log`) | **10,139 passed · 0 failed · 59 skipped** |
| Typecheck / lint | exit 0 / 0 errors, 9 warnings (same as `main`) | exit 0 / 0 errors, 9 warnings (same as `main`) |
| Payroll reader, 43 sentences | 0 false Yes, 0 false No — byte-identical results to B | 0 false Yes, 0 false No |
| Payroll through the chat, 19 scenarios | **19/19** | **19/19** |
| Browser save + read-back (No×3 / Yes) | not run on A (the reader and proposal change are identical to B's, which passed 9/9) | **9/9** Playwright |
| Local-stack integration | not run on A (no database, auth or route change) | **25/25** |
| Regression probes vs `main` | not run on A (only payroll changed; payroll probes above) | 0 regressions; 48/51 · 17/17 · 36/36 · 16/16 |

## Risk comparison

| Risk | Option A | Option B |
|---|---|---|
| Live payroll defects remain in production | **Removed** | **Removed** |
| Chance of a new regression from the release | **Very low** — one pure reader + 9 lines in the proposal; no route, schema, auth or UI change; every payroll test passes | **Moderate** — 22 production files; mitigated by 0 probe regressions, full suite green, 9/9 browser, 25/25 integration |
| Review size | ~180 production lines | ~1,370 production lines, 33 commits |
| Owner sign-off needed | none beyond payroll | spelling rule reversal; date / store / two-person behaviour |
| Other known defects left in production | F-02 (a store reply can overwrite the employee), F-03, F-04, F-07/F-08, F-09, F-11 (prior forms across stores), F-12 | Low residuals only (B3, R1, N5, P-1) |
| Later merge | B after A: same content, different SHAs; merges cleanly, history shows the payroll change twice | — |
| Rollback | revert 4 small commits | revert a 33-commit merge |

## Recommendation
**Option A first, then Option B after the owner review.** A removes every live payroll defect with the smallest change and review; B carries ten more fixes and owner-visible behaviour changes that deserve their own sign-off. If you prefer a single release, B is releasable on its own evidence.

## To release Option A (each step needs your approval)
1. Permission to push `qa/bubbles-payroll-only`, then a PR into `main`; CI green.
2. Review `payroll-deduct.ts` and the 9-line `form-proposal.ts` change.
3. Deploy; record the deployment time (the HR audit window end).
4. Smoke test in production without creating a form: "we will not payroll deduct $25" → card **No**; "no need for the $25 payroll deduction" → card **asks**; "payroll deduct $25, she was late" → card **Yes**, and a drafted plan says "$25 will be deducted…" with no comma.
5. Run the HR audit (`hr-audit/HR_AUDIT_PLAN.md`).
