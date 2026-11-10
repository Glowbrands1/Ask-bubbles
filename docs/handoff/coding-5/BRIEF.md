# October PR triage — brief for one slice

Two sibling Next.js apps share chat/forms code: Ask Sunny (GitHub Glowbrands1/ask-sunny) and Ask Bubbles (GitHub Glowbrands1/Ask-bubbles).
QA found about 100 PRs, opened 24–26 Oct 2026, whose default-off flag never reached `main`. Each PR fixed a chat or form bug behind a flag.
For EACH PR in your slice, decide one of:

- (a) SUPERSEDED: the bug is already fixed on main by another flag or PR. Name that flag, PR or file, and SHOW it: a test or replay case using the PR's own wording passes on main with production's flags.
  - If it passes on main only with some other default-off flag turned on, write "(a*) fixed on main behind <FLAG>, which is off in production".
  - If the PR's own flag or code is already on main (merged some other way), write "(a) already on main: <evidence>".
- (b) STILL A LIVE BUG: the PR's wording still gives the bad result on main with production's flags. Report it only. Do NOT rebuild it.
- (c) OBSOLETE: the feature changed and the PR no longer applies (e.g. the code it edits is gone, or the behaviour was redesigned). Say what changed.

If you cannot decide with reasonable effort, write "(?) undetermined: <why>". Don't guess.

## Tools and setup
- PR data: GitHub MCP tools. Load them with ToolSearch "select:mcp__github__pull_request_read". Use method get (title/body/state), get_files and get_diff (the PR's own tests hold the manager's wording). Some PRs may already be CLOSED or MERGED: record the state you see.
- `main` is checked out (read-only for you) at the worktree named below, with node_modules ready. Search it with grep for the PR's flag name and the code it touched.
- Production flags: `src/config/production-flags.json` ("on" list). The replay pack (`src/app/api/chat/replay-pack/`) runs the real chat route with those flags.
  - For a unit-level check, write a TEMPORARY test file at `src/__triage__/<SLICE>-<pr>.test.ts`. In it, stub every "on" flag via `vi.stubEnv(name, "true")` (read the JSON in the test), call the same function the PR's test called, and assert the PR's expected result.
  - Run it with `npx vitest run src/__triage__/<SLICE>-<pr>.test.ts`.
  - Often the PR's own test file can be adapted: copy its cases, drop flag-specific stubs, add production stubs.
  - Delete your temp files when done. Never edit other files. Never commit, push, comment on, close or modify any PR.
- Other agents work in the same worktree at the same time: only touch files named with your SLICE prefix.
- Tests take a few seconds each. Do not run the full suite.

## Output
Write `<SCRATCH>/oct/<SLICE>.md`: a markdown table with these columns:

| PR | State | Flag | Bug (one line) | Class | Evidence (test run on main a529c29e/f337302d + what fixed it, or what still fails) |

Below the table, add a short list of the (b) items, each with the exact wording that still fails and the result on main.

Use invented names only; never copy real employee names from PR bodies into the table. Write "<employee>" instead.

In your final message, return the counts per class and the (b) list.
