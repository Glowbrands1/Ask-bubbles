# HANDOFF — Gate-Bubbles-3 (13 Nov 2026)

## Role
Gate runner for Ask Bubbles, working for QA (session_01VVEkRTbAAAt573oWSKM3jW). I only gate: I merge a PR head
onto a given main in a scratch worktree and run 1 OFF + 1 ON over the chat/forms suites. OFF = production-flags.json
`on` + `assumedOn`; ON adds the PR's flag. I classify every changed test (INTENDED / INTENDED-ADJACENT /
INTENDED-HARNESS / REGRESSION / FLAKY), probe the real chat route where it matters, give GO / NO-GO, write a record
`R<N>.md` + `R<N>.classes.json`, push it to `claude/gate-bubbles-3-records` and send QA the verdict.
Never merge, deploy, set Vercel envs or call the Vercel API. Never use real employee names (invented names only).

## In flight now
Nothing is running. #869 (PLACE_STRIP_WHOLE_PHRASE_ONLY) head `3c900125` is GO and ships in release 17v, per QA.
The next #869 delta is the compass-only "of" follow-up PR, which has **not landed yet**. When it lands, delta it with:
- "…because she was at kearney high of all places", "…kearney high school of all places",
  "…the west dodge mall of all things", "…Kearney High of all places", "…at kearney high" (control).
  On 3c900125 all except "high school" and the control are rewritten ON exactly as OFF ("Kearney NE high of all
  places", store = Kearney): the "of" exception defeats the fix. No word is lost in Bubbles.
- "at kearney west of the register" must still be rewritten (the store is read).
- The earlier probe set: 21 chat-route sentences + 48 rewrite-level phrasings (gate-tools/, below).
- `store-alias.test.ts` with the flag unset AND with PLACE_STRIP_WHOLE_PHRASE_ONLY_ENABLED=true in the env (26/26 both on 3c900125).

## Queue, in order. All HELD by QA's pause ("nothing else until I send new work")
1. #869 follow-up (compass-only "of"): delta as above, when it lands.
2. #695 `d5089bf6` CITATION_LINE_KEPT_ON_REVISION_ENABLED, on current main. The revision.ts diff must be exactly
   the approved lines: list it in the record.
3. #681 `bcde7927` ADD_THAT_IS_ACCOUNT_ENABLED, on current main.
4. #740 re-gate `eb687efe` CARD_NEVER_SILENT_ENABLED, on current main. Check nov8-near-miss-card-kept-make-that-change
   has no stacked second lead. (#740 was NO-GO earlier.)
Refs `refs/gate/pr695`, `pr681`, `pr740b` existed locally; re-fetch with `git fetch origin pull/<N>/head:refs/gate/pr<N>`.
Confirm each flag name in `src/lib/config/chat-quality-flags.ts` of the PR.

## Verdicts this stretch (records on claude/gate-bubbles-3-records)
- #504 7ed3e938: GO. #678 94435d0a: GO, pin update needed before the flip. #684 2346fc0b: GO.
- #853 99495f32: GO. #869 775d57a1: NO-GO. #869 7b417965: GO with follow-ups. #869 3c900125: GO (delta).
- Earlier: #754 #755 #760 #790 #744 #819 #832 GO; #767 NO-GO; #734 GO at 869e6616; #740 NO-GO; #735 GO;
  #735b GO; #745b GO with a defect; #831 GO at 2c4204de (NO-GO at fc5d3012).

## Findings not yet acted on
- #678: `nov10-reopened-edit-keeps-details-clear/-replace` pin the reopened Details with toBe(raw account). With
  COACHING_OBSERVED_SAVED on, the Details are "Observed:\n"+account, so 4 tests fail. It's a stale pin; the gate
  checked that toContain passes. The pin must be fixed in #678 or in the flip PR.
- #684: the author's rebase must chain the form-draft route as the gate did: outline strip → withoutAppInstructions →
  card-meta strip (branch `claude/gate-bubbles-3-merge-684`). corrective-action-dm-feedback-e2e "create verbal CA for …"
  runs ~4.4–4.7 s against vitest's 5 s default (it timed out once under load) and needs an explicit timeout.
- #853: two different people with the same name, store AND title get identical options ("1. X (Store 264, Team Member
  Part Time) or 2. X (Store 264, Team Member Part Time)"). A duplicate Woven row, such as a rehire, would look the
  same. Needs a distinguishing label. Minor: it says "is a close match" for an exact name.
- #869: (a) the "of" exception (above). (b) "because she was at sioux falls west" (a school) is read as the Sioux
  Falls (W 41st St) store, OFF and ON alike: QA's "separate later case". (c) "stuck in west dodge street traffic"
  is rewritten "Omaha NE (West Dodge Rd) street traffic", OFF and ON alike.
- #745b: the terse "writen ca … " card has no Issue or Policy line (nov10-future-incident-date-terse-typo stays
  open), and it says "press Create draft on the card" with no card shown.
- #735b: the store-only re-ask repeats verbatim (wording note).
- Waiting on QA: new work after the pause; the #869 compass-only follow-up PR.

## Branches I own with no PR
- `claude/gate-bubbles-3-records`: all records (docs/flag-classification/R*.md + .classes.json), this file, and
  docs/flag-classification/gate-tools/.
- `claude/gate-bubbles-3-merge-504` cdbdc3dd, `-678` 477161ab, `-684` 6fffb9f0, `-735b` 0d91e6ab,
  `-745b` d01c0f88: gate merges (PR head onto main) whose conflicts I resolved by hand, kept as evidence. Not for
  merging. 504/735b/745b: keep-both on the CHAT_QUALITY_FLAG_NAMES list. 678: keep-both on an import list.
  684: the chained resolution above.
- Local-only, not pushed: 17 more `gate3-p<N>` scratch branches. Each is a clean `git merge` of the PR head onto
  main by "gate". Every other commit on them is the PR's own commit, already on GitHub, so there is nothing to keep.

## Scheduled reminders
None. I set no send_later, routines or cron jobs.

## Files the next session needs (all pushed to gate-tools/ on the records branch; my disk goes away)
- `gate-seven.sh <N> <FLAG>[,<FLAG2>]`: creates /home/user/gate/p<N> from BASE (a per-PR case table; "current
  main" = origin/main), merges refs/gate/pr<N>, runs tsc, then the harness with 1 OFF + 1 ON and checkpoints to
  $S/ck/p<N>. It writes logs/p<N>/{base,head,merge,run}.txt and status ("MERGE-CONFLICT" / "TSC-FAIL" /
  "DONE rc=…"). Run it in the background (~75 min, under the 2 h cap):
  `echo "$(date +%T) start N" >> $S/queue.log; $S/gate-seven.sh N FLAG; echo "end N $(cat $S/logs/pN/status)" >> $S/queue.log`.
  It resumes from checkpoints after a container restart (just re-run it).
- On MERGE-CONFLICT: in the worktree, resolve (keep both for name/import lists; think when both sides rewrite the
  same line), `git add`, `git commit --no-edit`, `npx tsc --noEmit -p .`, `touch logs/pN/tsc.ok`, rewrite head.txt
  (HEAD + HEAD^{tree}), `rm logs/pN/status`, then re-run gate-seven.
- `harness/flag-classify-resume.ts`: a copy of scripts/flag-classify.ts with checkpoint/resume (RESUME_DIR,
  STOP_AFTER_ONE, GATE_NAME). It writes docs/flag-classification/R<N>.md in the worktree and reads R<N>.classes.json
  (test id → {category, reason}).
- `finalize.sh <N> <FLAGS>`: re-classifies from the checkpoints after you write R<N>.classes.json.
- `wdiff.py <ckdir>`: groups OFF→ON reply diffs in the replay records into patterns.
- `base853.sh`: runs the replay pack alone on an unmodified base with production flags (REPLAY_RECORD), to show a
  non-flag change moves no OFF case. Compare case by case (id, mode → ok + replies).
- `zz-gate-probe869.test.ts`: rewrite-level probe (rosterNames OFF vs ON, written to PROBE_OUT). Run it in a
  SEPARATE worktree, never in a gate worktree while a gate run is going (vitest would collect it).
- `probe869-cases.ts`: the PR's nov13 case file plus a GATE PROBE block. Append the block to that file in a probe
  worktree, run `replay-pack-e2e.test.ts -t gateprobe869` with production flags + PROBE_OUT, then `git checkout`.
  Each case runs in production mode and fix-flag mode, giving OFF/ON in one run.
- Records: worktree /home/user/gate/records on branch gate3-records; push with
  `git push origin gate3-records:claude/gate-bubbles-3-records`.
- Env for one-off runs: `env -i PATH HOME LANG=C.UTF-8 NODE_ENV=test TMPDIR=… <prod flags>=true node
  node_modules/vitest/vitest.mjs run …`, where the prod flags are production-flags.json `on` + `assumedOn`.
  `npm run eval` = `vitest run --config vitest.eval.config.mts` (35 tests; no network).

## Rules I follow
- Gate only. No merging, deploying, Vercel envs or Vercel API.
- Invented names only, in records, probes and messages. No credentials anywhere.
- Gate on the base QA names; say so when main has moved on.
- Classify every changed test. A stale pin or a harness effect is never called a regression without evidence, and
  vice versa.
- Probe the real chat route for anything a reply or store read depends on, not just unit functions.
- Protected hunks (approved patches) are checked byte for byte against docs/patches/*.patch.
- Send each verdict to QA as soon as it's done, with the head SHA, counts, evidence, and the open → holding cases.
- One record per PR on claude/gate-bubbles-3-records; commits end with the session's attribution lines.
- Follow QA's pause: run only what QA has released.

## First 3 things for my successor
1. Fetch `claude/gate-bubbles-3-records`, copy docs/flag-classification/gate-tools/ to your scratch dir, and fix the
   `S=` path at the top of gate-seven.sh and finalize.sh. Re-fetch the refs: `git fetch origin
   pull/<N>/head:refs/gate/pr<N>`.
2. Ask QA whether the pause is lifted and whether the #869 compass-only "of" PR has landed; delta it first (above).
3. Then take #695 / #681 / #740 in that order, on current main, only when QA releases them.
