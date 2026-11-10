# Rebuild an October PR on current main — brief

Two sibling Next.js apps share chat and forms code:
- Ask Sunny (Glowbrands1/ask-sunny; JB & Associates / Sun Tan City; "salon").
- Ask Bubbles (Glowbrands1/Ask-bubbles; Buff City Soap; "store").

QA triaged the October PRs. Yours still fail on main with production's flags. You must rebuild each one on current `main`, following QA's rules exactly:

- ONE default-off flag per bug.
  - Reuse the old PR's flag name.
  - Add it to `src/lib/config/chat-quality-flags.ts` just before the line `// --- end coding 5 flags ---`, with a doc comment that names "QA's October triage of #NNN, 10 Nov 2026".
  - Bubbles only: also add the name to `CHAT_QUALITY_FLAG_NAMES`, before `"CHAT_STAGE_TIMINGS_ENABLED",\n] as const;`. Add it after that line, with a `// coding 5:` comment.
  - Sunny only: also add the name to `src/lib/ai/flags-off-parity.test.ts`, right after `"UNDATED_ACCOUNT_BRIEF_ENABLED",`.
- PROTECTED FILES must not be edited: `form-proposal.ts`, `proposal.ts`, `form-date-answer.ts`, `server-ask.ts`. Use a post-step instead:
  - in `src/app/api/chat/route.ts`, following the existing `answer = (await import(...)).withX(answer, ...)` steps;
  - or in a non-protected module (`src/lib/forms/*`, `src/lib/ai/*` other than those four).
  - If the old PR edited a protected file, re-home the logic.
- Flag OFF must leave behaviour byte-identical.
- Regression tests use the PR's OWN wording, with invented names only. Never copy a real person's name from a PR body; the old PRs' tests already use invented names.
  - Prove each test FAILS with the flag off and PASSES with it on.
  - Where an existing test's expectation changes with the flag on, make it flag-aware with a `// Changed on purpose (QA's October triage, 10 Nov 2026): …` comment. Don't weaken it.
- A replay case in `src/app/api/chat/replay-pack/nov10-<slug>-cases.ts` (auto-loaded by glob).
  - Model it on `nov10-draft-no-invented-plan-cases.ts` or `nov10-card-opener-once-cases.ts` in the same app, with `status: { open: "<what fails in production>" }` and `fixFlags: [FLAG]`.
  - Check it with both commands below. Production should give "1 passed | 1 expected fail" per case; with the flag on it should report "Expect test to fail", meaning it now passes.
    - `npx vitest run src/app/api/chat/replay-pack/replay-pack-e2e.test.ts -t "<case id>"`
    - `FLAG_CLASSIFY_ON=<FLAG> npx vitest run src/app/api/chat/replay-pack/replay-pack-e2e.test.ts -t "<case id>"`
  - To see why an expected-fail case fails, set `status: "fixed"` temporarily, then restore it.
  - The harness (`replay-pack-e2e.test.ts`, `cases.ts`) offers `t.directory(STAFF)`, `t.as(role, scope)`, `t.thread().say(...)`, `thread.proposal`, `thread.create()`, `t.draftWrites(...)`, `t.values(id)` and `t.modelSays(...)`.
  - Use only names on the pack's own STAFF list, or invented ones.
- Getting the old code: `git fetch origin pull/NNN/head:refs/remotes/origin/pr-NNN`, then cherry-pick its own commits (skip merge commits and unrelated stacked commits) and resolve conflicts. Or re-apply the mechanism by hand if main has moved too far. The repo history is shallow, so `git merge-base` with main may be empty.
- In Bubbles src code, write "the sibling app", never "Sunny". Never copy one company's content (job titles, salon/store names, brand names) into the other.
- Before committing, all of these must pass, and the commit must contain only your changes:
  - `npm run lint` (0 errors);
  - `npx tsc --noEmit -p .`;
  - `npx vitest run <every test file you touched or added>`;
  - the replay check above.
- Commit messages:
  - Explain the bug, the mechanism, the tests and the replay case.
  - Include the line "Supersedes #NNN."
  - End with exactly these two lines:

    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_016JaKhX8wfuQ2x6dMgca9K5

  - Never put a model name anywhere else.
- Push with `git push -u origin <your branch>` (normal push, never force). Do NOT open a PR, do NOT comment on GitHub, and do NOT run the full `npm test` suite; the coordinator runs the full suites.
- `node_modules`: the worktree has a symlink already. Never run `npm install`.
- Work only inside your own worktree(s).

Report at the end:
- for each branch: name, head SHA, flag;
- what the fix does;
- which tests and replay cases were added, with their off/on results;
- anything you could not fix, or decisions QA should know about.
