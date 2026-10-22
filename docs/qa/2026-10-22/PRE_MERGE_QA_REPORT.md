# Ask Bubbles — final pre-merge QA (pull request #69, 22 Oct 2026)

**Verdict: PASS.** Safe to merge and deploy after the owner's approval. Nothing here was merged, deployed or closed. No production database or HR record was read or changed.

## Heads
| | SHA |
|---|---|
| Final code head | `ef037d6`. Its code is identical to `7e68a0e`; only docs follow |
| `main` / Bubbles production | `e7dd377` (payroll-only release, pull request #67; production deployment `dpl_qapWgWpjkZjZ3SQk7okAmXUvBm2V`). The branch contains it and is 0 commits behind |

## Results (run on the final code head, sequentially, synthetic data)
| Check | Result | Baseline |
|---|---|---|
| Full suite | **10,161 passed · 0 failed · 59 skipped** | 10,161 / 59 |
| Typecheck / lint | exit 0 / 0 errors, 9 warnings (same as `main`) | same |
| Production build (`next build`, live mode) | exit 0 | — |
| Local database (Postgres + GoTrue + PostgREST) | **25/25** | 25/25 |
| Playwright (live build, seeded synthetic accounts) | **12/12** | 12/12 |
| Regression probes (7 sets) | **identical** to the overnight run | — |
| Release-decision and payroll test set | 361/361 | — |

GitHub Actions and the Vercel preview are reported on the pull request for the final head.

## Release decisions verified
1. **Roles that cannot create forms:** Employees and Assistant Managers hold no form-creation permission (`src/config/company/access.ts`, unchanged by this release), so the server refuses them.
2. **Ambiguous store numbers are asked:** a number two numbering systems give to different stores is asked, never guessed (`store-woven-form-flow.test.ts`).
3. **District managers without verified assignments stay blocked:** no store is filled in, and the server refuses (`location-authority.test.ts`; locprior probe).
4. **Names are kept exactly as typed** (`qa-w2-employee-e2e.test.ts`; Playwright read-back saved `pat rivera`).
5. **R1 and N5 are not in this release.**
6. **Payroll corrections never silently change a finalized record:** a correction goes to a new draft and the finalized record is untouched (post-creation probe, 12 scenarios; `qa-payroll-after-creation-e2e.test.ts`).
7. **The production payroll safeguards are intact:**
   - `payroll-deduct.ts` and `chat-correction.ts` are byte-identical to production `e7dd377`.
   - Reader, 43 sentences: 0 false Yes, 0 false No.
   - Chat: 19/19.
   - After creation: 12/12.

## Code and security review
- **Migrations, environment variables, dependencies:** no database migration, no environment-variable change, no dependency or lockfile change.
- **Permissions:** the role matrix, `authorizeRequest` and `src/config` are unchanged.
- **Location choices:** every store choice still passes the server's location check. A forged store id returns 403 (Playwright).
- **Prior forms:** the draft route attaches prior forms only through the actor-scoped reader, and only where the name is one person at that store.
- **`.gitignore`:** now commits `CLAUDE.md` (the session rules). Approved parity work.
- **CI:** `.github/workflows/ci.yml` adds lint, typecheck and tests on every pull request.
- **Secrets:** none in the diff, in tests or in the QA evidence (scanned for API keys, JWTs, private keys, database URLs with passwords, and company email addresses).
- **QA evidence package:**
  - Rebuilt to cover Ask Bubbles only.
  - Superseded runs removed; the docs folder went from 15 MB to the files listed in `README.md`.
  - Local machine paths and a placeholder key string sanitized.
  - The earlier two-company reports are in this branch's history only.
- **Cross-company isolation:** 0 Ask Sunny data in Ask Bubbles code or tests. The one hit is a guard asserting "Lawrence" is not a Bubbles store.

## Overlapping pull request #68
| #68 change | Status in #69 | Recommendation |
|---|---|---|
| A defaulted form date is not the manager's; a day stated once (`ac900ba`) | **Missing from #69** | Keep |
| The draft's notice is shown on the chat card (`c77864c`) | **Missing from #69** | Keep |
| Amounts without "$", "change … to $5.00", a decimal point in "… to no" (`46ec530`) | **Missing from #69**. Built on the same reader as production, so no conflict | Keep |
| Correct a Corrective Action Form's date from chat (`134155b`) | **Not in #69. Reverses a pinned rule** (`chat-correction.test.ts`); the sibling app's companion pull request deliberately did not port it | **Needs the owner's product decision.** If not approved, drop this one commit (it stands alone) |
| Audit regression suite, 64 scenarios (`ba76612`) | **Missing from #69** | Keep |

**Trial merge of #68 into #69:**
- No conflicts.
- Full suite **10,268 passed**. The one failure was a 10-second setup timeout in `google-reviews/sync.db.test.ts` under a parallel run; that file is untouched by either PR and passed 24/24 when rerun alone.
- The payroll reader, chat and after-creation probes are **identical** to #69's, so the production safeguards are preserved.

**#68 is not superseded:** it carries four fixes #69 lacks. Recommended order:
1. Merge #69.
2. Update #68 from `main` (no conflicts expected).
3. Decide on `134155b`.
4. Re-run CI and review, then merge #68.

Do not close #68.

## Remaining risks
- **Owner-visible behaviour:**
  - Names kept as typed (reverses the 9 Oct rule).
  - The date question.
  - Store-reply and two-person behaviour.
- **#68 after #69:** it needs a merge from `main`, a product decision on `134155b`, and a retest.
- **Historical payroll records:** forms saved 2026-10-21 20:55:49 – 2026-10-22 19:00:51 UTC may carry a wrong Yes. The read-only HR audit is separate from this deployment and needs the owner's approval (`hr-audit/`). **No HR record needs changing for this deployment.**
- **No production smoke test yet:** see `POST_DEPLOY_SMOKE_TESTS.md`.
- **Rollback:** redeploy `dpl_qapWgWpjkZjZ3SQk7okAmXUvBm2V` (`e7dd377`). It keeps the payroll safeguards. No migration is involved.
