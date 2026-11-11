# Gate runner, Ask Bubbles: handoff at 10 Nov 2026 ~18:40 UTC (session migration)

Role: gate runner. Gives QA the verdict per unit (3 OFF + 3 ON, solo bisect, scans, eval, release head). Writes no product code, never merges, never touches Vercel, flags or the database. Pushes release heads to NEW branches `claude/gate-bubbles-rN` (normal push, never force) when QA authorizes. Reports only to QA by send_message (QA = the session titled "QA").

## State of gates (all heads are on origin)
| round | unit | verdict | head |
| --- | --- | --- | --- |
| 15c | SECTION_BREAKS_KEPT etc. | GO, merged #683, main 09a0660d | claude/gate-bubbles-r15c 77d920dc |
| 16A | #665 roster set pass 1 | NO-GO (25 REGRESSION) | record R16A |
| 16B | wipe guard, create-from-conversation, card names employee, same request other person, stage timings | GO 5 flags, merged #699 (main a529c29e); ONE_FORM_EACH_PERSON NO-GO; A3 held | claude/gate-bubbles-r16b eaf10ac4 |
| 16C | #665 roster set (head 44441d35) | GO (167 INTENDED, 0 REGRESSION); ON HOLD by QA for two twins; coding 2's head d7487833 is being RE-GATED | claude/gate-bubbles-r16c d7487833 (my last 2ec17c2b) |
| 17b | #685 DRAFT_WRITE_NEVER_SILENT, #703 CA_REASON_DUE_TO, #706 FAILURE_TO_OPEN_IS_LATE_OPENING, #707 PAYROLL_BARE_SENTENCE | GO all 4, verdict sent to QA | claude/gate-bubbles-r17b fab769b7 (tree d27bd4bd), on main a529c29e |

## Still running when this was written
16C re-gate on coding 2's d7487833: worktree /home/user/gate/r18a (branch gate-r18a, pushed as claude/gate-bubbles-r18a 2ecd7d27, tree 49ad0a80 = d7487833 code with the release edits taken back to main's files, i.e. main + the #665 set + the r22 fix). Production-env arms, ON flags = FORM_NAME_FROM_ROSTER, NEAR_MISS_QUESTION_RULES, NEAR_MISS_DETAILS_ACCEPT, FORM_NAME_OFF_ROSTER_ASK. Checkpoints live only in the old sandbox. A replacement must re-run it (step-r18a.sh).
Bar QA set for 16C: the sf-s4 case holds; the lead-in ("Oops, it's ...") unit test passes; s14-shape stays OPEN.
Paused: #705 gate (3 runs done, scratchpad only; re-run).

## Queue (QA's order; heads as sent)
1. 16C re-gate d7487833 (running) -> then #716 NEAR_MISS_ANSWER_KEEPS_REQUEST (98ae0273, based on claude/gate-bubbles-r16c: gate on top of the 16c head)
2. EXCERPT_BRAND_FILTER_ENABLED (HIGH, flag-only, code on main; production-env arms, solo, eval; if GO ships with next release)
3. #705 ab2bc8f5 (POLICY_REFERENCE_NOT_ACCOUNT, LEVEL_AFTER_FORM_NAME, LEVEL_REQUEST_MORE_VERBS; solo each; also drops the count-h18 "tans" case)
4. #710 DRAFT_WROTE_NOTHING_NOTICE 167ffa29 -> #712 NOT_FOLLOWING_IS_VIOLATION 131400e9 -> #713 EXIT_TYPO_WORDS 6f0429f0 -> #714 ACCOUNT_BEFORE_REQUEST 8400d34c -> #717 brand scan + BUBBLES_METRIC_WORDS 387ae1fd
5. B504 FULL_POSITION_TITLE d71d2d50; #678 COACHING_OBSERVED_SAVED dccfad88 + #684 APP_INSTRUCTIONS_NOT_ACCOUNT b2e3726e; #695 CITATION_LINE_KEPT_ON_REVISION 38a61c78 (revision.ts diff must be exactly the approved lines)
6. #663 ONE_FORM_EACH_PERSON 6c68b998 on main a529c29e; then A3 COACHING_ASKS_WHAT_HAPPENED + #693 255a2c62 as one unit; #709 CREATE_REPLY_PLAIN 1ccc7366 with/after #663
7. #681 ADD_THAT_IS_ACCOUNT; PROPOSAL_NAME_CORRECTION (flag-only); #686 50dabf29; #687 d66aa801; #688 b644cd54 (5 flags, solo each); #689 054fbaac; #691 4415355b; #692 3b498d11; #694 d6af973c; #696 0ba7389c; #697 4bf27350 with #647 (+ POLICY_LINE port when sent); #698 9eb1429d; #500 357cd313; #480 aa3b1b87; #702 32628a28; #464 cdf644cc; #704 33172ee4; #708 1f481b67 (+STEP_B_ADD_UNDER_OBSERVED)
8. #690 ADD_NOT_REPEATED_SENTENCES: use head 47c7ef9c (not 326b79d1). Read the SAVED Observation text OFF vs ON for nov7-refusal-bub-phone-trace and the section-break cases (replay assertions only check presence; Sunny's port saved the Expectation block twice).
9. A7 INCIDENT_FROM_EARLIER_TURN, A8 POLICY_CITATION, A9 STEP_B_ADD_UNDER_OBSERVED + STEP_B_REPLY_KEEPS_LINES (flag-only, production-env arms)
Dropped: #682 (superseded by r15c).

## Method (what the next gate runner needs)
- OFF = production env: every flag in `src/config/production-flags.json` "on" + "assumedOn" exported as env (`prodenv.csv`, passed with `--with`), ON = that + the unit's flags. Until round 16C my arms exported only the unit's flags for non-replay tests; only the replay pack forced the production list. That is why the "written warning" loss (RELATIVE_DATE_READER) was not seen. Under production env the non-replay suite has 812 failing / 16,995 tests on main a529c29e (known baseline, list in `PRODENV-BASELINE-a529c29e.md`); classify only rows that CHANGE between OFF and ON; rows failing in both arms are baseline. The 520 baseline rows without a "pinned" wording still need a reader (coding): prior-actions, corrective-action-dm-feedback, corrective-action-conversation, reopen-request, pm-framework-readiness, and the written-warning family.
- Recipe: `git worktree add -b gate-X <dir> origin/main`, symlink node_modules from /home/user/Ask-bubbles, `git fetch origin pull/N/head` and `git merge --no-ff` each PR. Union merges of `src/lib/config/chat-quality-flags.ts` break: run `harness-r16/keepboth.py`, `fixflags.py`, `verifyfns.py`, then tsc (closing brace / `/**` opener lost; each new flag function must be byte-identical to the PR's). Then `step-<name>.sh` loop (exit 75 = one run checkpointed, repeat until not 75; the final call classifies), create `docs/flag-classification/<NAME>.classes.json` from earlier records without their REGRESSION rows; `solo-*.sh` bisect (one flag per call, ALLDONE at exit 3) over the changed test files; `harness/scan.py`, `show.py` on the kept dir; `harness/attrib5.py`.
- Release head: flags into production-flags.json "on" (a flag listed in "off" must be removed there; a flag in production must not be in evals/flags.json "on"; keep FORM_EDIT_TOOL_IN_STREAM_ENABLED and FORM_EDIT_NOOP_GUARD_ENABLED there), add a dated `_about` line, `FIXED_IN_PRODUCTION` entries in `src/app/api/chat/replay-pack/production-fixes.ts` for OPEN cases that now hold (the replay pack shows them as "Expect test to fail"), eval baseline (`EVAL_UPDATE_BASELINE=1 npm run eval`, only intended changes), re-record `src/lib/forms/form-edit-single-writer-flags-off.main.json` (`RECORD_MAIN_FIXTURE=1`) when a reply-wording flag goes into production and diff only the intended text. Run tsc, eslint, replay pack, `src/lib + src/app/api/forms + src/app/api/chat` (no replay pack) and the eval; push the head to a new `claude/gate-bubbles-rN`, then message QA the head and tree.
- Classes: INTENDED, INTENDED-HARNESS, REGRESSION (against ONE flag), FLAKY (automatic), UNCLASSIFIED. Bar: 0 REGRESSION, 0 UNCLASSIFIED, 0 FLAKY, plus the solo passed->failed scan. Add a make-about -> add chained check asserting the SAVED Details hold one copy. One heavy job at a time. Replay is not live: flag anything that needs a live AI check.
- Tool limits: a call times out at 10 minutes; poll long jobs in the background. A stop hook demands commit/push of untracked docs: commit gate records to the docs branch, then delete the worktree copies.
- Names in records are invented. No credentials anywhere.
