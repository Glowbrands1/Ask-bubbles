# HANDOFF — Gate-Bubbles-5 (13 Nov 2026, ~21:40Z)

## Role
Gate runner for Ask Bubbles (Glowbrands1/Ask-bubbles) for QA (session_01VVEkRTbAAAt573oWSKM3jW). I only gate: merge a PR head onto
current main in a local worktree, run the test suite with production flags OFF vs ON (+ the PR's flags), classify every changed
row (INTENDED / INTENDED-ADJACENT / INTENDED-HARNESS / REGRESSION), probe the new logic with gate-only tests, and send QA a
GO / NO-GO per flag with evidence. I reply to QA with send_message only. I never merge, deploy, set Vercel envs or call the
Vercel API, and never use real employee names. Records go to branch `claude/gate-bubbles-5-records`
(docs/flag-classification/gate-bubbles-5/).

## In flight now
- **B#872 ACCOUNT_CHANGE_REDERIVES_POLICY_ENABLED**, head **88409387** (Coding-2), merged on main **86abc8f0** in worktree
  `/home/user/gate/p872` (clean merge, tsc clean, no protected file touched).
  - Arm: 1 OFF + 1 ON, queue id `#872`, started 21:30Z, ETA ~22:20Z. Output: `$S/rec/872/run.log` + `.md` (S = scratchpad, below).
  - Done and sent to QA: probes and eval.
    - The PR's 2 open cases (sanitation, phone) fail OFF and hold ON; named-policy-kept holds both ways.
    - ON plan text: sanitation → offense/Policy Violated "Other", plan "…review the applicable company policy…" (never
      "the Other policy"); phone → "Standards of Conduct — Cell Phone/Smart Watch Policy", plan and Direct policy follow.
    - A manager-typed Action Plan, a typed Policy Violated and a manager tick are all kept.
    - "add that it was in the morning" and "add that she was also on her phone" do NOT re-derive.
    - Eval 23/24 both columns (b12 baseline), 0 diffs.
  - To finish: classify the arm's rows. Expected: only the 2 open cases (and their it.fails wrappers) plus the
    flags-off-parity HARNESS row. QA: the "make it about her phone use instead…" path refuses in the stand-in with the flag
    on or off → mark it HARNESS, not REGRESSION. Then write G5-872.md, push, and send GO / NO-GO.

## Queue (in order)
1. Finish B#872 (above).
2. Held by QA's pause (do NOT run until QA says): B#842 TERSE_REQUEST_ACCOUNT + CREATE_POINTS_TO_SHOWN_CARD (last head seen
   3d3adbb7); B#769 STORE_CHOICES_NAMED (98ef818e; a run on aecb3342 looked intended — see G5-769-aecb-note.md; needs a re-run
   on current main).

## Verdicts given today (all in the records branch)
- #861 EDIT_SEES_SAVED_FORM: GO (c2a720f0; already ON in production since 17u). G5-861-edit-only.md.
- #861 CARD_CHECKED_AGAINST_WORDS: GO at **33fc5fa0** on main 6081b825 (after NO-GOs at c2a720f0 and e47fcff8).
  G5-861-card-33fc5fa0.md; full probe history in G5-861-card-probes.md.
- #855 (no "covers every store" line once the place sets the store): GO. #846 OFFERED_NAME_ACCEPTED: GO. #858 business date:
  GO (one "flag off" row needs pinning). #844 / 834 / 791 / 792 / 739 / 775 / 781 / 768b / 756b / a9: GO (see each G5-*.md).

## Findings not yet acted on
- #861 CARD: the card check's model call never runs in the replay pack (code settles everything), so its model path is
  untested until the live test. The EDIT check counts are a minimum (the stand-in confirms unscripted rounds).
- #858: business-today.test.ts "flag off: the UTC date" row doesn't pin the flag off (needs vi.stubEnv(FLAG, "")).
- #781: three tests assume ATTENDANCE_PLAN_NEEDS_LATENESS is off without pinning it (see G5-781.md).
- #756: form-edit-single-writer-flags-off.main.json must be re-recorded before its flags go on.
- b302464a (#861 test-only) pins CARD off in proposal-path-flags-e2e's ALL_FLAGS, so those S22 rows can't see CARD; CARD-on
  coverage now lives in the replay cases (nov13-card-checked-name-answer / request-not-a-detail).
- Waiting on QA: the place of #842 and #769 after the pause.

## Branches I own without a PR
- `claude/gate-bubbles-5-records` (records only, no code). Latest commit: the one that adds this file.
- Local only, NOT pushed (by design): ~47 `gate5-*` branches in /home/user/Ask-bubbles. Each is a merge of a PR head onto
  main, made only to run tests. No original code; every PR head they contain is on GitHub under its PR. Nothing is lost
  if they vanish.

## Scheduled reminders
- None. (No send_later / triggers set.)

## Files the next session needs (copied to harness/ in this branch)
S = /tmp/claude-0/-home-user-Ask-bubbles/36b45174-6117-53a7-898e-3ebed59a3cae/scratchpad (my disk; goes away).
- `harness/fc.ts`: my copy of scripts/flag-classify.ts. It takes `--flag A+B` (several ON flags), `--with <prod list>`,
  `--runs N --keep <paths>`, and reads env FC_DOCS (output dir). Each run is a child vitest with a clean env:
  OFF = production flags, ON = + the flags. It writes `<FLAG>.md` (changed rows) and keeps the raw json and replay jsonl.
- `harness/prodenv.sh <worktree>`: prints production-flags.json on + assumedOn, comma-joined.
- `harness/queue.sh <ids…>`: for each id, cd /home/user/gate/p<id> and run fc.ts over src/lib/ai src/lib/forms
  src/app/api/chat src/app/api/forms with the flag(s) from its map F; logs "start/done #id" to $S/queue.log. Edit S at the top.
- `harness/show.py <kept dir>`: prints each replay record whose reply differs OFF vs ON, as a diff.
- `harness/rec.py <id> <classes.json>` (env S, R): fills categories into the md and writes G5-<id>.md/.classes.json to R.
- `harness/codedelta.sh <worktree> <outprefix>`: runs the replay pack + one test with that tree's production flags (for a
  code-vs-code delta, when the flag is already ON in production).
- `harness/probes/`: gate-only probes (copy into a SEPARATE worktree, never the one a gate is running in).
  - zz-gate5-added-facts-probe.test.ts and zz-gate5-compound.test.ts: addedFacts join probes (env PROBE_OUT, TAG).
  - nov13-gate5-tester-flow-cases.ts (#846) and nov13-gate5-872-probe-cases.ts (#872): replay cases. Run with
    `-t <id prefix>` and REPLAY_RECORD.
- How to run a gate:
  1. `git worktree add -b gate5-N /home/user/gate/pN <main>`
  2. `ln -s /home/user/Ask-bubbles/node_modules node_modules`, then `git merge --no-ff <pr head>`; on a flag-list conflict in
     chat-quality-flags.ts keep both sides (function bodies: insert "}\n\n/**\n" between).
  3. `npx tsc --noEmit -p .`
  4. Add `[N]=FLAG` to queue.sh's map, then `nohup setsid bash -c "$S/h/queue.sh N" &`.
  5. Wait on "done #N" in $S/queue.log (the worker restarts often and kills runs: check pgrep and restart).
- Eval: add the flag to evals/flags.json "on" in a copy only, run
  `node node_modules/vitest/vitest.mjs run --config vitest.eval.config.mts evals/replay.eval.ts`, read evals/results/latest.md,
  then `git checkout evals/flags.json`. Bubbles has 24 eval cases (b12 fails at baseline).

## Rules I follow
- Gate only: no merge, deploy, Vercel API or env changes; no PRs; don't push to PR heads (freeze) unless asked.
- DB reads only by my own ids, counts only; no real names in records (invented people only); no model IDs; no secrets.
- Protected files (proposal.ts, instances.ts, chat-revision.ts): the diff must equal the approved docs/patches file (byte check).
- Classify every changed row; an "off" test that doesn't pin its flag is HARNESS, never REGRESSION.
- Keep "mechanism proven (stand-in model)" separate from "real model untested".
- Never put a probe in the tree a gate is running in.
- Commit messages end with the Co-Authored-By and Claude-Session lines; push records to claude/gate-bubbles-5-records.

## First 3 things for my successor
1. Read G5-872 status: if `$S/rec/872` is gone (new disk), re-run B#872 1 OFF + 1 ON on current main using harness/,
   classify (expect 2 open cases + wrappers + parity HARNESS; make-it-about refusal = HARNESS), send QA GO / NO-GO.
2. Re-create the harness from harness/ (fix the S path in queue.sh / codedelta.sh) and run `npm ci` in a fresh clone.
3. Ask QA whether #842 and #769 are still held, then follow QA's queue.
