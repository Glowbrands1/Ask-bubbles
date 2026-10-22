# Final release readiness — Ask Bubbles (22 Oct 2026)

## 1. Branch and commit

* Branch `claude/charming-goldberg-2lg2uq`; release head `8daa001` (this document is added in the commit after it).
* Release commits are listed in the PR (`git log origin/main..HEAD`).

## 2. Pull request

[Glowbrands1/Ask-bubbles#70](https://github.com/Glowbrands1/Ask-bubbles/pull/70) into `main`. Merged after the checks below (owner authorization, 22 Oct 2026).

## 3. Integration status against `main`

* `main` (`e7dd377`) is merged into the branch with a merge commit; no rebase or force-push. The branch is 0 commits behind.
* main's payroll-deduct fixes (`4df6fbb`…`56c45e1`) are included and pass on the merged tree: their own tests 17/17, and the forms, AI and chat suites 5,863 passed.
* No database migrations, no `vercel.json`, Next config or dependency changes, and no new environment variables.
* Vercel built a Preview deployment of the release head with the production configuration: **READY** (`askbubbles-l7ufh3ik2-glo-brands.vercel.app`).

## 4. QA results

| Check | Result |
|---|---|
| Full vitest on the release head | **9,934 passed · 0 failed · 59 skipped** (9,993 tests, 2,245 suites) |
| Typecheck | clean |
| ESLint (whole repo) | 0 errors (9 warnings, all in files this release does not touch) |
| CA conversation QA (saved-state assertions) | 63 tests, all pass |
| Playwright (headless Chromium, demo build) | 110 passed · 10 skipped · 0 failed (run before the main merge; the merge touched only payroll text readers) |
| Local Postgres with the real migrations | duplicate id 23505 · finalized values refused 23514 · browser roles refused 42501 · audit events and `form_date` sync stored |
| Live model, live database through the app, live browser on the CA flow | **NOT TESTED.** There is no isolated staging, and the owner approved production without it on 22 Oct 2026. |

Details are in `docs/OVERNIGHT_QA_REPORT.md`.

## 5. Remaining blockers

None for deployment (owner decision, 22 Oct 2026: proceed without staging). The live checks above are done as read-only production smoke checks after deploy.

## 6. Policy-manual approval

Established. CA citations resolve to the owner-approved Woven handbook "2025 JBA Policy Manual - Edited 5-2025" (`81622d77…`, Woven entity `42486200…`, approved 8 Oct 2026). Any future manual found only by name from an upload is marked "requires owner confirmation".

## 7. Existing-draft rollout impact

4 of 17 open CA drafts (read-only count, 22 Oct) have no manager-decided level.
* After deploy, they show a notice with a **Confirm** button (or "Choose the Type of Warning"), and finalize returns 409 until the manager decides.
* Nothing is converted automatically and nothing needs recreating.
* Employee, dates, prior actions and audit history are untouched (QA e2e Q18 and Q20).
* Finalized forms are unchanged.

## 8. Staging

The owner chose not to make staging a release prerequisite. `docs/STAGING_PLAN.md` stays as a reference for later.

## 9. Deployment and rollback plan

1. Merge the PR into `main` (merge commit). Vercel deploys `main` to Production.
2. Confirm the Production deployment is READY and its `githubCommitSha` matches the merge commit.
3. Check runtime errors and logs (the baseline is no runtime errors in the 24 h before the release), and run read-only smoke checks.
4. **Rollback:**
   * Promote the previous Production deployment `dpl_qapWgWpjkZjZ3SQk7okAmXUvBm2V` (commit `e7dd377`) in Vercel. This is instant, needs no rebuild, and there's no schema to undo.
   * Or `git revert -m 1 <merge>` and redeploy.
   * Rows written after the release (edited events, `manager_confirmation`, `ownerConfirmed`) remain valid JSON under the old code.

## 10. Recommendation

**READY FOR PRODUCTION: approved by the owner on 22 Oct 2026 without staging. Live checks are limited to read-only smoke checks after deploy.**
