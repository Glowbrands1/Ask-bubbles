# HANDOFF — Gate-Bubbles (13 Nov 2026, 21:40Z)

## Role
- I run the flag gate for Ask Bubbles (Glowbrands1/Ask-bubbles). I report to the session named QA. Work comes only from QA.
- For each flag or PR QA sends, I run the unit tests and replay pack once with the flag OFF and once ON, on production's flags. Some gates use 3 runs each way.
- Every changed row gets a category: INTENDED, INTENDED-HARNESS, REGRESSION or FLAKY. Then I probe the edge cases with scratch replay cases, run `npm run eval` with the flag on, and send QA a GO or NO-GO.
- Verdicts go to `docs/flag-classification/<NAME>.md` + `<NAME>.classes.json` on branch `claude/new-session-dsbnb6`.
- My progress log is `docs/flag-classification/GATE-BUBBLES-POSITION.md`. Read item 5, the long DONE/NOW line.
- I never merge, never touch Vercel (no API, no tools), flags or the DB, and run one heavy job at a time.

## In flight now
- Nothing is running. The last gate finished at 21:30Z.
- **B866B: DONE, GO.** PR #866 (ANSWER_IS_THE_ISSUE_ENABLED), head 87471628, merged locally with main 6081b825 (95c91b00, clean, tsc clean).
  - 1+1 on 6081b825's production flags (404 flags): 15 changed rows. 14 INTENDED, 1 INTENDED-HARNESS (flags-off-parity), 0 REGRESSION.
  - Probes hold. Eval 35/35 OFF and ON.
  - Verdict: `docs/flag-classification/B866B.md` (commit 6ed243a3). Sent to QA at 21:33Z.
- QA's last order (21:31Z) says "keep working on your current gate". The current gate is done, so I'm waiting for QA's next item.

## Queue, in order
1. **B848C: HELD** since QA's pause (13 Nov 02:23Z). Re-gate of CA_NO_POLICY_ASKS_WHICH_ENABLED on PR #848 head a9cfb380, worktree /home/user/gate/b848c.
   - off-1 was checkpointed on my disk, which goes away. The next session must re-run OFF.
   - Resume only on QA's word. Earlier verdict B848: NO-GO, 189 rows, because the which-policy question appeared on 205 replies that had no card.
   - Before re-running, rebase onto current main: ask QA which head and base.
2. Nothing else is queued. QA sends each item.

## Findings not yet acted on
- **From B866B.** These are wrong on main and the same with ANSWER_IS_THE_ISSUE off and on, so they're not #866's (sent to QA as follow-ups):
  - "write up Rowan Kestrel, Assistant General Manager, for leaving the safe open" → the Issue is the whole sentence.
  - "ca for Rowan Kestrel at west dodge, Team Member Part Time, she was late on 11/2 and didnt call" → the Issue keeps the prefix "Team Member Part Time, ".
  - "make it about leaving the safe open" after a card whose Issue is only a title → the title stays. Coding-2 says the make-it-about path handles this message (ai/make-it-about.ts).
- **Pins to move on merge:**
  - B857: prior-sentence D1, 4 pin rows.
  - B849: 2 pins.
  - G464: 16 pins of the old Animals+Visitors pair.
  - B825: 2 pins. Check whether they're already moved.
- **B830:** GO on behaviour, but CI stays red until the new case is recorded as fixed in production. It has no flag of its own.
- **Older open rulings:** see GATE-BUBBLES-POSITION.md, e.g. R795T "Team Member" in Job Title, QA to rule.

## Branches I own with no PR
- `claude/new-session-dsbnb6` (Ask-bubbles), head 1556cc8d. Gate verdicts, the position file, this handoff and `gate-harness/`. It is a docs-only branch with no PR, by design. QA reads it.
- Nothing is unpushed. `git log --branches --not --remotes` is empty in both repos, there are no stashes, and both trees are clean.
- The worktrees under /home/user/gate/* are detached local test trees. Some hold local merge commits (PR head + main) made only to run a gate, e.g. b866b 95c91b00 and b857b a74ad275. They aren't pushed on purpose: each one is just `git merge <main>` on the PR head and can be rebuilt.

## Scheduled reminders I set
- None. `list_triggers` shows 3 reminders, all bound to other sessions: QA's "17w CI + merge", "#860 gate" and "Sunny 38b". None is mine.

## Files on my disk the next session needs
All of them are now on the branch under `docs/flag-classification/gate-harness/` (commit 1556cc8d):
- `flag-classify-resume.ts`: the gate. Resumable. With `STOP_AFTER_ONE=1` it does one run per call; rc=75 means call again.
  - Args: `--flag F [--and G] --with <comma list> --runs N --keep src/lib/ai src/lib/forms src/app/api/chat src/app/api/forms`.
  - Env: `RESUME_DIR` (checkpoints), `GATE_NAME` (output name), `TMPDIR`.
  - Output: `docs/flag-classification/<GATE_NAME>.md` in the worktree. Rerunning after the classes.json is written re-renders it in about 0s.
- `active/step-b866b.sh` + `active/loop-b866b.sh`: the pattern for a gate. Copy with sed for a new gate (b866b→bNNN), then set the flag, worktree and prodenv.
  - Run: `bash loop-bNNN.sh` in the background, logging to `<scratch>/bNNN.log`.
  - The paths inside point at my scratchpad: replace them.
- `active/classify.py`: `classify.py <md> <classes.json-out> < rules.json`. Rules are `[[substring, category, reason], …]`; the first match wins. `active/rules-b866b.json` is an example.
- `rdiff.py <kept> <case-prefix>`: per-turn line diff OFF→ON of the replay records. `scan.py <kept>`: the record scan. `show.py`: shows the turns.
- `active/agg857.py` / `active/chk857.py`: aggregate line diffs, and "Create the draft here" lost.
- `active/zz-probe-b866-cases.ts.txt`: the probe pattern. Copy it into `src/app/api/chat/replay-pack/zz-probe-<x>-cases.ts`; `index.ts` picks up `*-cases.ts`.
  - Run OFF and ON. Each turn is written to `$OUT` as `{said, template, issue, issueLine, create, asks}`.
  - Delete the file afterwards and check `git status` is clean.
- **prodenv:** `production-flags.json` "on" + "assumedOn" as a comma list (`active/prodenv-6081b825.csv`, 404 flags). Rebuild it for each new main:

```bash
git show <main>:src/config/production-flags.json | python3 -c "import json,sys;d=json.load(sys.stdin);print(','.join(dict.fromkeys(d.get('on',[])+d.get('assumedOn',[]))),end='')"
```

- **Probe / eval command:** a clean env, with each prodenv flag set to true:

```bash
env -i PATH=$PATH HOME=$HOME LANG=C.UTF-8 NODE_ENV=test OUT=<f> $(tr ',' '\n' <prodenv.csv | sed 's/$/=true/') [FLAG=true FLAG_CLASSIFY_ON=FLAG] node node_modules/vitest/vitest.mjs run src/app/api/chat/replay-pack/replay-pack-e2e.test.ts -t "zz-probe-<x>"
```

  For the eval, use `--config vitest.eval.config.mts` instead. LIVE stays unset, so there are no model calls.

## Rules I follow
- Work only on QA's items. During a QA pause, start nothing new and resume on QA's word.
- Never call the Vercel API (api.vercel.com, by curl or any script) and never use Vercel tools. Only QA reads or changes Vercel.
- Never merge PRs. Never change flags, Vercel or the DB.
- Run one heavy job at a time (one gate loop or one probe run).
- Use invented names only (e.g. Rowan Kestrel) in probes, docs and commits. No real employees, no model IDs, no secrets.
- Push only to `claude/new-session-dsbnb6`. Never use bare `git stash`.
- Gate on production's flags from production-flags.json (on + assumedOn), never on assumptions.
- Classify every changed row, read the actual record diffs, and probe beyond the PR's own cases.
- If the PR head doesn't contain the main QA names, merge them locally, check tsc, and say so in the verdict.
- Message QA with `send_message` to session_01VVEkRTbAAAt573oWSKM3jW.

## First 3 things for my successor
1. Pull `claude/new-session-dsbnb6`. Read GATE-BUBBLES-POSITION.md and `gate-harness/README.md`. Copy `gate-harness/` into your scratchpad and fix the paths in the step and loop scripts.
2. Tell QA you're live and ask whether B848C (CA_NO_POLICY_ASKS_WHICH, PR #848) resumes, and on which head and main. The OFF checkpoint is gone, so it needs a full 1+1.
3. For the next gate, make a worktree (`git worktree add --detach /home/user/gate/<x> <head>`), symlink node_modules, merge QA's main if the head lacks it, run `npx tsc --noEmit -p .`, build prodenv, then run the loop.
