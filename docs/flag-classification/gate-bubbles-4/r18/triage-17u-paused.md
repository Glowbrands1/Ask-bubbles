# Triage of 16 paused Bubbles PRs on main 6081b825 (Gate-Bubbles-4, 13 Nov 2026) — report only, not pushed

Key finding: 52e07b49 ("Keep the paused 17s build (2b9a2821) in history") is an `-s ours` merge (tree == parent 1).
The 8 PRs whose heads are inside 2b9a2821 show "merged" on GitHub (merged_by null, 10:03:21Z) but NONE of their code
or flags is on main: #739 #843 #504 #750 #724 #678 #779 #848. `git merge` of their heads is a no-op; they must be
re-landed as patches (diff merge-base(head,60d9634d)..head) or reverted-ours.
#830 (open) was merged in 17s and taken out by 122d2260; a plain merge of its head re-adds only 71f519ab and fails tsc
(hasObserved missing). It needs `git revert 122d2260` + merge (then clean, 4 files +110/-7).

Method: worktree per PR on 6081b825; open PRs merged (union on flags/parity files, fixflags.py), discarded ones
re-applied with git apply -3; tsc 0 on all 16 after resolution. Each PR's own replay cases run on the merged tree with
production flags only (404 on+assumedOn, PR flag off); OPEN case still failing = "expected fail" = still needed.
#830 case run on plain main (fails: instruction lands under Observed). #774 (no replay): own e2e passes clean env 28/28;
6 other failures in that file identical on main under prod env (env pollution). #750/#757: Woven, no replay; flags absent on main.

| PR | state | flag(s) | still needed (OPEN failing in prod) | conflict on 6081 | risk | order |
|---|---|---|---|---|---|---|
| 849 | open 99ad14d0 | POLICY_DASH_LINE_PAGE, ADDED_ACCOUNT_ON_CARD | yes 2/2 | flags file (keep-both) | low (off) | 1 |
| 848 | DISCARDED a9cfb380 | REOPEN_IS_OPENING, BARE_FORM_NAME_ASKS_WHAT, THIS_FORM_IS_ABOUT, PASTED_REVIEW_ASKS_WHAT_YOU_SAW, CA_NO_POLICY_ASKS_WHICH | yes 5/5 | applies clean; re-land as new PR | low-med (5 flags, route.ts) | 2 |
| 830 | open 6ededb81 | none (behind live STEP_B_ADD_UNDER_OBSERVED) | yes (fails on main) | form-write.ts; needs revert of 122d2260 | HIGH: live at merge, no kill switch; taken out once for tool path | 3 (re-gate tool path first) |
| 847 | open 606db333 | APPROVER_TITLE_NOT_EMPLOYEE | yes 1/1 | flags file | low | 4 |
| 678 | DISCARDED 94435d0a | COACHING_OBSERVED_SAVED | yes 3/3 | draft/route.ts import (keep-both) | low | 5 |
| 684 | open 2346fc0b | APP_INSTRUCTIONS_NOT_ACCOUNT | yes 4/4 | draft/route.ts: compose with OUTLINE_ON_OPEN_PROPOSAL line (hand) | low-med | 6 |
| 724 | DISCARDED 439f6415 | MAKE_THAT_UPDATE_ACCOUNT | yes 1/1 | flags; form-content-turn.ts block misplaced by 3-way, placed by hand | med (hand placement) | 7 |
| 756 | open 592b14b7 | POLICY_BLANK_HONEST_REPLY, POLICY_GATE_NONBLOCKING (+NEXT_PUBLIC_) | yes 2/2 | flags file | med (17 files, prompts.ts, harness) | 8 |
| 843 | DISCARDED 8bdfdd90 | PAYROLL_AMOUNT_AFTER_PAYROLL | yes 2/2 | flags | low | 9 |
| 739 | DISCARDED f42d3055 | SURNAME_PARTICLES | yes 2/2 | flags + parity | low | 10 |
| 504 | DISCARDED 7ed3e938 | FULL_POSITION_TITLE | yes 3/3 | flags | low-med (title reader shared with 847) | 11 |
| 779 | DISCARDED 14b2681c | none (ONE_FORM_EACH_PERSON / COACHING_ASKS_WHAT_HAPPENED, both off in prod) | yes 1/1 | clean | low; ships with that flip | 12 |
| 772 | open 40041a20 | ACCOUNT_TYPOS_FIXED | yes 1/1 | flags + parity | low | 13 |
| 774 | open 48a08a3f | REVISION_REPLY_SHOWS_FIELDS | yes (feature absent) | flags + parity | low | 14 |
| 750 | DISCARDED b16581ae | WOVEN_DOCUMENT_KEEP_OUT, WOVEN_DUPLICATE_CONTENT_HOLD | yes (absent) | clean | low-med (admin+sync, 15 files) | 15 |
| 757 | open 7dfcc8bb | WOVEN_LARGER_FILES | yes (absent) | flags | low | 16 |

Shared files / flags between PRs: chat/route.ts 724+756+848+849 (724x848 import clash, keep-both); draft/route.ts
678+684; title-of-the-employee.ts 504+847 (import clash; both change title reading: gate together); ingestion/pipeline.ts
750+757; flags-off-parity.test.ts 739+772+774 (comment blocks); flags file all except 830/779/750/848. No flag shared.
