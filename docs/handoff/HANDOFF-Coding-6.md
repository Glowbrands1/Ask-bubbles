# HANDOFF — Coding-6 (13 Nov 2026, ~21:45Z)

## Role
Coding session for both apps: Ask Bubbles (Glowbrands1/Ask-bubbles, stores) and Ask Sunny (Glowbrands1/ask-sunny, salons).
I report to QA (session_01VVEkRTbAAAt573oWSKM3jW).
- I fix chat and form bugs behind new flags that are off by default.
- Every fix gets a regression test in the reporter's words and a replay case.
- Every fix is ported to the other app, or gets a parity-log entry saying why not.
- Gates I work with: Gate-Bubbles-5 (session_01VVEkRSezZaCHhWPXD3orxg), Gate-Sunny-2 (session_01VVEkRTTtcCFSfqi9h8mA15), Gate-Sunny-3 (session_01VVEkRTfSdtNumqyJyVuXQA).
- Coding-2 (session_01VVEkRSH2EFvUPK7WHrnPTJ) owns server-ask.ts and ca-policy.ts.

## In flight now
1. **B#861** EDIT_SEES_SAVED_FORM + CARD_CHECKED_AGAINST_WORDS. Head **33fc5fa065**, frozen.
   - EDIT is merged and live (17u).
   - CARD: Gate-Bubbles-5 gave GO at 33fc5fa0 (record G5-861-card-33fc5fa0.md). QA is shipping it as 17w (#873).
   - Nothing for me to do unless the gate or live test finds a bug.
2. **S#929**, the Sunny twin. Head **1e50ff976**, frozen. Gate-Sunny-2's merge arm is running.
   - Don't push to #929. The parity follow-up is on its own branch (see the branches section).
3. **B#871** (head e411007060) and **S#942** (head 0190ed13b9): MADE_ABOUT_EMPTY_PATCH_ANSWERS_SAVED + ADD_ALREADY_ON_FORM_SAYS_SO, default off.
   - They fix QA's live 17u findings: "make it about her phone use instead…" saved a change and then replied "I haven't changed…"; and item 5, "add that …" already on the form.
   - Both are pre-existing bugs, not EDIT_SEES.
   - npm test green in both (B 20314, S 22158). Full replay off/on clean.
   - Gate findings fixed in new commits: a negation must match in place, whole = entire, and filler words are skipped.
   - MADE_ABOUT is a GO candidate. Waiting on Gate-Bubbles-4 and Gate-Sunny-3.

4. **POSITION_ANSWER_NOT_A_SENTENCE** (Bubbles only), branch `claude/position-answer-not-a-sentence` (0d82f4ce55, from main b9720947). PR after the whole-pack diff (task bmvhbqr9w; outputs pos-*.txt and pos-*.jsonl in scratchpad).
   - Also: "she's a key holder" -> the reply says "Job title set to **Key Holder**"; "<A>, Team Member Part Time" keeps the title (title-of-another-person.ts: hours words are never a name).
   - QA's live 17w finding: "she gets a verbal warning" became the card's Position. This is pre-existing, not CARD.
   - Fix: `forms/employee-position.ts` readPositionAnswer skips a pronoun+verb sentence or level/payment words.
   - Sunny has no position question, so it's covered by a parity-log entry instead of a port.

5. **CARD_ADDED_FACT_IN_OBSERVATION** (Sunny only), branch `claude/card-added-fact-replaces-observation` (b80cf5bd2, from main 24e0fb74).
   - QA's 38f finding: the card's Observation held the whole added turn, while the note showed only the trimmed fact.
   - Fix: the line is rewritten to match the note. CARD is rolled back in Sunny production.
   - Gate-Sunny-3 is assigned. Open the PR when runs bx63vmo8q (obs-*.txt) are clean.
   - Separate finding, both apps: at Create, the drafting prompt gets the raw turns (including the hedge "she maybe forgot"). Whether the saved draft carries it needs a live Create; QA decides.

## Queue in order
1. **SAME_NAME_UNMAPPED_NOTE + PLACEHOLDER_TITLE_IS_NONE**, branch `claude/same-name-unmapped-note` (B be815e447b, S ec135482d). No PR yet.
   - Opens after #861 and #929 merge, when QA says.
   - What it does: when an active same-name twin sits at a location that isn't mapped, the card adds "There's also an active <name> at a location that isn't one of your salons/stores… This card is for the one at <place>."
   - Woven's "No Position Set" becomes no job title (it showed as "Job title: No").
   - Sunny full replay: off 1697/20; on, the only × are the 2 new cases' production arms.
2. **Code-settle follow-up**, branch `claude/edit-sees-code-settle-followup` (B ef0f4197b4, S 6849ab84d). No PR yet.
   - Contains the name-fix / form-name code settle that was reverted out of the frozen PRs.
   - Opens after #861 and #929 merge, when QA says. Merge main first.
3. **Sunny parity follow-up**, branch `claude/card-answer-after-naming-turn` (S **bd8ae94ea**, on top of #929's 1e50ff976). No PR.
   - Ports B#861's 33fc5fa0 fix: the card reads the account in the turn after the naming turn, and "<title> Part Time" counts as a title.
   - Sunny does NOT show the bug, because its card has no Issue.
   - After #929 merges: merge main, then open a PR (or QA gates it as a CARD-only delta).
4. Older items, low priority:
   - #18 SAME_NAME: identical options get a distinguishing label; an exact match is worded as a match (both apps).
   - #19 S#922 tidy-ups: pin intent tests to production flags; hold Create while the same-name choice is open.
   - #16 intent-extraction name tests pinned to production flags (test only).
   - #17 TERMINATION_CARD_TIDY on the off-roster ask path, "Issue: do not terminate yet" (Bubbles).
   - #13 B#830 (head 6ededb81) is still OPEN and NOT on main: 122d2260 took its first fix out. Re-land: `git revert 122d2260`, then merge.

## Findings not yet acted on
- **Stale policy after a made-about rewrite** (QA's 17u live test): after "make it about her phone use", Policy violated, Direct policy and the action plan stay Attendance. QA is routing this to Coding-2 (ca-policy.ts) on a separate flag. Not mine.
- **Sunny 38b same-name diagnosis.**
  - Not a bug: the roster only keeps people at 'mapped' locations, and the twin is at an 'ignored' location.
  - "Job title: No" came from Woven's placeholder "No Position Set" (1 of 144 active people in Sunny, 0 of 87 in Bubbles).
  - Queue item 1 fixes both.
- **CARD with ANSWER_IS_THE_ISSUE (Coding-2's B#866):** checked on a scratch merge of #866 and #861@33fc5fa0 with both flags on. Coding-2's 3 both-flags cases hold. Both flags give the account; never blank, never the title.

## Branches I own with no PR
- `claude/same-name-unmapped-note`: B be815e447b, S ec135482d (queue 1).
- `claude/edit-sees-code-settle-followup`: B ef0f4197b4, S 6849ab84d (queue 2).
- `claude/card-answer-after-naming-turn`: S bd8ae94ea (queue 3).
- Local-only work from earlier sessions, pushed today so nothing is lost. Each was only on this disk:
  - Bubbles `claude/handoff-c6-m-733` (7b124c57cf): a merge of main into m-733.
  - Bubbles `claude/handoff-c6-pr-849-17q-live` (99ad14d07e): the 17q live-miss fixes plus the instruction-starts-expectation commit, with main merged in. Probably already landed through other PRs; check with `git cherry` before using it.
  - Bubbles `claude/handoff-c6-830-rebased` (eb809cbe77): the #830 rebase. NOT stale: #830 is still open. Compare it with the `git revert 122d2260` method before deleting it.
  - Bubbles `claude/handoff-c6-noshow-wip-stash` (e36891a01c): stash "coding6-noshow-wip", the late-open/no-show WIP (late-open.ts, flags, 3 files). Pushed as a stash commit.
  - Sunny `claude/handoff-c6-make-that-update-account-wip` (2796cab23f): WIP MAKE_THAT_UPDATE_ACCOUNT in form-content-turn. Its note says it is off production's patch-reducer path.
  - Sunny `claude/handoff-c6-oct-rebuild-no-card-no-claim` (f46620ac70): 6 commits of NO_CARD_NO_DRAFT_CLAIM ports plus "WIP second-person account words". Check whether they're already on main.
- Not pushed, on purpose: /home/user/wt-b-457 has an abandoned merge of main in progress (MERGE_HEAD, 567 staged files, 0 conflicts). It holds no work of its own; it's main's content. Safe to discard.

## Scheduled reminders I set
None live. My "Check B#868 merge" reminder (trig_013tn3UoLuvfUjVZF1nYGdoV) was deleted after it was done. The triggers listed on the account belong to QA and other sessions.

## Files on my disk the next session needs
- Scratchpad repro `repro-phone-cases.ts`: superseded by the committed `src/app/api/chat/replay-pack/nov13-made-about-empty-patch-cases.ts` on B#871 and S#942. Not needed.
- Run outputs (`mae-*.txt`, `smae-*.txt`, `ess-card-on.txt`): the numbers are copied into this file and the PR bodies. Not needed.
- Nothing else unique. All code is on GitHub.

## Key technical notes
- Card check (`forms/card-checked-against-words.ts`, both apps):
  - Code checks come first: issueProblem, personProblem, accountFromWords, addedFacts with the notAFact rules (level, title, place, hedge, history, money owed, PAY_FOR).
  - Then a model fallback, at most 2 calls, which must quote her words.
  - It never invents anything; a gap gets "What happened?".
  - As of 33fc5fa0, accountFromWords also reads the turns after the naming turn.
  - Bubbles' place typos use main's `editDistance` (one letter off, two from 7 letters), NOT `closeWordDistance`. Its five-letter floor would let "the Omah store" and "West Doge" join.
- Replay harness:
  - `FLAG_CLASSIFY_ON=<flags>`: a × on a case's "OPEN in production" arm is expected.
  - `FLAG_CLASSIFY_OFF` forces flags off.
  - `t.patchChecks`/`patchCheckCalls` are the EDIT check rounds; `t.cardChecks`/`cardCheckCalls` are the card model calls.
  - `t.calls().revision` is cumulative across arms, so assert the per-turn difference.
- Freeze check for #861/#929: `git diff <frozen> <new> -- src ':!*card-checked-against-words*' ':!*.test.ts' ':!*replay-pack*'` must be empty.

## Rules I follow
- Never call the Vercel API or use Vercel tools. Only QA reads or changes Vercel.
- Coding-2 alone writes `src/lib/ai/server-ask.ts` and `src/lib/forms/ca-policy.ts`.
- Pau-protected modules (form-field-state, form-proposal, forms/proposal, chat-revision, instances, Sunny payroll-deduct): changes only as a hunk in docs/patches/*.patch, approved by QA.
- Every fix gets a new default-off flag, a test in the reporter's words, a replay case (open on production flags, holds with the flag), and both apps covered (port or parity log).
- Never copy one company's content into the other app; port the mechanism. Name mapping: store ↔ salon.
- Both repos are public. Use invented names, checked against the directory. Production reads: counts, ids and booleans only.
- No force push (merge or revert instead). Never close PRs. Check a PR is OPEN before pushing. No pushes to a frozen PR unless a gate finds a bug and QA agrees.
- No model identifiers in commits, PRs or code.
- Commit trailer: Co-Authored-By plus a Claude-Session line. A PR body ends with the "Generated with Claude Code" line and the session link.
- Before pushing: lint, tsc, the touched tests, and the full replay off/on (npm test before a PR).

## First 3 things my successor should do
1. Message QA with your session id. Ask whether B#871 / S#942 have a gate assigned, and whether #861 / #929 have merged.
2. When #929 merges: merge Sunny main into `claude/card-answer-after-naming-turn` (bd8ae94ea), run the card unit tests and the full replay, and open the parity PR. Then open the PRs for `claude/same-name-unmapped-note` and `claude/edit-sees-code-settle-followup` in both apps, merging main first, once QA says.
3. Triage the `claude/handoff-c6-*` branches (`git cherry origin/main <branch>`): delete what's already on main (with QA's OK), and queue what isn't.

## Audit output (21:45Z, after the pushes above)
### /home/user/Ask-bubbles
$ git stash list
stash@{0}: On claude/no-show-opening-attendance: coding6-noshow-wip
$ git log --branches --not --remotes --oneline
(every commit listed is now on a claude/handoff-c6-* branch, see above)
$ git status (all worktrees): clean, except /home/user/wt-b-457 (abandoned merge of main, nothing unique) and Sunny wt-s-ess "ahead 1" = bd8ae94ea, pushed as claude/card-answer-after-naming-turn
### /home/user/ask-sunny
$ git stash list
$ git log --branches --not --remotes --oneline
(every commit listed is now on a claude/handoff-c6-* branch, see above)
$ git status (all worktrees): clean, except /home/user/wt-b-457 (abandoned merge of main, nothing unique) and Sunny wt-s-ess "ahead 1" = bd8ae94ea, pushed as claude/card-answer-after-naming-turn

## CARD_ACCOUNT_DROPS_NON_FACTS (queued, both apps; QA 23:02Z)
Gate-Sunny-3's 78-row probe on S b80cf5bd2 (record: claude/gate-sunny-3-records, card78.txt). It is pre-existing and separate from 38f.
The gap rows by marker:
- [3a] the whole turn stays in the Observation, with no note: #13 14 15 16 17 19 21 24 41 46 52 54 65 69.
- [3b] the Added text keeps a hedge, title or history clause: #18 20 33 34 43 47 48.
- [3c] the fact is not joined with "; ": #25 37 40.
- [3d] a new fact is dropped: #22 49.
- [NEG] a negation is added as a fact: #75 76.
Fix in the Sunny base Observation builder (keep-filled-slots.ts) and in the card-check addedFacts; check the Bubbles Issue path with the same sentences.

## FREEZE (Pau, 23:25Z): run state
- POSITION_ANSWER_NOT_A_SENTENCE (B, 0d82f4ce55): the replay with the flag off is clean, and the whole-pack diff (1045 records) differs only in the 3 new cases. `npm test` and lint were stopped mid-run.
  Resume: `cd Ask-bubbles; git checkout claude/position-answer-not-a-sentence; npm test; npm run lint`, then open the PR (no PR open yet).
- CARD_ADDED_FACT_IN_OBSERVATION (S, b80cf5bd2): the full replay runs were stopped. Gate-Sunny-3's interim review says it's a strict improvement.
  Resume: on branch claude/card-added-fact-replaces-observation run `npx vitest run src/app/api/chat/replay-pack` (off), then with `FLAG_CLASSIFY_ON=CARD_CHECKED_AGAINST_WORDS_ENABLED,CARD_ADDED_FACT_IN_OBSERVATION_ENABLED`, then `npm test`, then open the PR (no PR open yet).
- Next in QA's order: ISSUE_IS_THE_ACCOUNT (forms/revision.ts is protected, so it needs a docs/patches/issue-is-the-account.patch and an APPROVED_PROTECTED_EDITS entry in src/lib/ai/flags-off-parity.test.ts), then CARD_ACCOUNT_DROPS_NON_FACTS.
