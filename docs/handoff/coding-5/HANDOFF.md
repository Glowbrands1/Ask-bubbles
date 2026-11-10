# Coding 5 handoff (10 Nov 2026, session migration)

Coding 5 worked on both apps, Ask Sunny (Glowbrands1/ask-sunny) and Ask Bubbles (Glowbrands1/Ask-bubbles).
It fixed QA/Pau reports behind default-off flags, and either ported each fix to the sibling app or logged why not.
It never merged a PR, flipped a flag or redeployed. All direction came from the QA session.

## Rules this session worked under (from QA)

- Every new behaviour goes behind a default-off flag. The exception is a content fix QA approves.
- These files are protected and need QA/Pau approval before any edit: `form-proposal.ts`, `proposal.ts`,
  `form-date-answer.ts`, `server-ask.ts`. Use a post-step in `src/app/api/chat/route.ts` or a `forms/` / `ai/`
  module instead.
- Every bug report gets a regression test in the reporter's wording, with invented names, plus a replay case
  (`src/app/api/chat/replay-pack/nov10-*-cases.ts`, auto-loaded by glob). The replay case shows
  `status: { open }` with production's flags and passes with `FLAG_CLASSIFY_ON=<FLAG>`.
- Run lint, `npx tsc --noEmit -p .` and the FULL suite before opening a PR. The full suite is
  `scripts/suite.sh <key> <worktree>`.
  - One suite takes 25–45 minutes on a loaded box.
  - Background jobs die at 2 hours, so keep each job to 3 suites or fewer, and don't chain waits on another job.
- One PR per bug per app. A rebuild of an October PR says "Supersedes #NNN" in its body; QA closes the old one.
- Flag registration:
  - Bubbles: add the flag before `// --- end coding 5 flags ---` and in `CHAT_QUALITY_FLAG_NAMES`.
  - Sunny: add the flag before the same marker and in `src/lib/ai/flags-off-parity.test.ts`.
- In Bubbles src, write "the sibling app", never "Sunny". Never copy one company's content into the other app.

## Open PRs from this session (unmerged)

| App | PR | Head | What |
|---|---|---|---|
| Bubbles | #663 | 6c68b998 | P6/P7: create-from-conversation, one form each, the card names its employee |
| Bubbles | #704 | 33172ee4 | RELATIVE_DAY_NOT_HISTORY (fallback hardening, low priority) |
| Bubbles | #708 | 1f481b67 | r16b: an "add" goes under Observed (ADD_OUT_OF_OTHER_SECTIONS) |
| Bubbles | #709 | 1ccc7366 | r16b P6 plain reply (CREATE_REPLY_PLAIN); stacked on #663 |
| Bubbles | #713 | 6f0429f0 | P17 exit typo words (EXIT_TYPO_WORDS) |
| Bubbles | #714 | 8400d34c | P14(a) account before the request (ACCOUNT_BEFORE_REQUEST) |
| Bubbles | #715 | d45b7fd8 | Docs: October PR triage table |
| Bubbles | #717 | 387ae1fd | Brand scan test, Club Close ban, BUBBLES_METRIC_WORDS |
| Sunny | #780 | 704faf00 | sf-s25 Observation (OBSERVATION_NO_EARLIER_QUESTION) |
| Sunny | #788 | 0c8908a8 | r16b add placement port (includes #662) |
| Sunny | #790 | 6330023e | r16b P6 plain reply port; stacked on #740 |
| Sunny | #793 | bd81f596 | P17 exit typo words |
| Sunny | #796 | f26012a9 | Docs: October PR triage table |

## Branches pushed but with NO PR yet (each needs its full suite, then a PR)

| App | Branch | Head | Flag | Supersedes / item |
|---|---|---|---|---|
| Sunny | claude/no-other-brand-strings | 3bb89ea4 | (test only) | the mirror brand scan for Bubbles #717 |
| Bubbles | claude/relative-beside-typed-date | 10004ab1 | RELATIVE_BESIDE_TYPED_DATE | "yesterday 10/21/26" keeps the typed date; plus the 2 "today" rows made flag-aware (QA option a). QA approved. |
| Sunny | claude/relative-beside-typed-date | c74ea1a6 | RELATIVE_BESIDE_TYPED_DATE | port of the above |
| Bubbles | claude/policy-gate-nonblocking | 77612648 | POLICY_GATE_NONBLOCKING (+ NEXT_PUBLIC_) | B#174: a blank Direct policy blocks CA finalize |
| Sunny | claude/excerpt-brand-filter | c5be2ec1 | EXCERPT_BRAND_FILTER | S#232 |
| Bubbles | claude/brand-reply-guard-rebuild | cb613c61 | BRAND_REPLY_GUARD | B#198 |
| Sunny | claude/brand-reply-guard-rebuild | a0bf1321 | BRAND_REPLY_GUARD | port of B#198 |
| Bubbles | claude/card-opener-once | 42afcb33 | HUMAN_REPLIES | B#200 |
| Sunny | claude/card-opener-once | e8e94496 | HUMAN_REPLIES | S#268 (closed) / the sibling's #200 |
| Bubbles | claude/draft-no-invented-plan-rebuild | 36537803 | DRAFT_NO_INVENTED_PLAN | B#188 |
| Sunny | claude/draft-no-invented-plan-rebuild | a60908bf | DRAFT_NO_INVENTED_PLAN | S#256 |

Item #4 of the rebuild (the Issue/Observation field cut or polluted) has its own section at the end of this file,
with the agents' branches.

## Flag flips QA must decide (no code needed)

- **Sunny, POLICY_GATE_NONBLOCKING_ENABLED (+ NEXT_PUBLIC_, then a redeploy).** The code is on Sunny's main but the
  flag is not in production-flags "on". Managers see the "not letting me complete it due to policy verification"
  block in Sunny today.
- **Bubbles, EXCERPT_BRAND_FILTER_ENABLED.** The code is on Bubbles' main and off in production. Source excerpts
  still show the Sun Tan City p.42 bullet.

## Queue / next, in order

1. Run full suites for every branch in the "no PR yet" table, then open the PRs.
   - Write the bodies to the PR template: What changed / How it was tested / Sibling app, plus the "🤖 Generated
     with Claude Code" footer.
   - Report each PR to QA.
2. Finish rebuild item #4, Issue/Observation (see the last section).
3. Rebuild item #5, the exit form. P17 (#713/#793) already covers "not rehireble" and "not eligable for rehire".
   Still live in both apps:
   - the run-on "… other career options items returned no deduct rehire yes": Rehire and Reason stay blank (B#183,
     S#251, EXIT_REHIRE_REASON);
   - "she resigned 9-15 on woven": no method is filled (same PRs);
   - "9/25 gave notice worked it til 10/9" and "gave notice 9/25 fulfilled 10/9" (B#177, S#245,
     EXIT_NOTICE_FULFILLED);
   - the prose details contradict the notes (B#195, S#263, EXIT_PROSE_FACTS);
   - "she submited her notice on 9/29/26" leaves the notice date blank (Sunny, no PR; check Bubbles).
4. Rebuild item #6, payroll: S#210 "payroll is deductable" asks the question again; S#247 "yes coaching for
   attendance" sets Payroll = Yes. Check Bubbles for both.
5. Rebuild item #7 (ops, lowest priority): S#264/B#196 reviews stale banner, S#211 empty or unauthenticated model
   reply, S#174 raw_answer trace, S#205 archived revision draft, S#209 PTO/FAQ answer items.
6. Low priority:
   - Rewrite the Bubbles tests and replay cases that say "club close" into Bubbles metrics, with
     "Changed on purpose" notes.
   - The BCS EPP metrics are DEFERRED by Pau; don't change the EPP templates.
7. When the brand-scan PRs merge: Sunny's `src/lib/brand/knowledge.ts` (added by claude/excerpt-brand-filter)
   holds the regex source "BCS" as a string, so add that file to the Sunny brand scan's allowlist in whichever PR
   merges second.

## Gotchas

- Stacked PRs: Bubbles #709 sits on #663, and Sunny #790 sits on #740. Sunny #788 includes #662.
- An expected-fail replay case hides its failure. Set `status: "fixed"` temporarily to see why it fails.
- The replay harness stubs knowledge search with no manual chunks, so a source excerpt can't be asserted
  through the route.
- With RELATIVE_DATE_READER on, two rows in `corrective-action-conversation.test.ts` write today's date. They are
  flag-aware on the RELATIVE_BESIDE branches.
- The brand scan reads string literals with the TypeScript parser, so comments and regex are not scanned. The exit
  footer's MyGlow/Sunlync stay, per Pau's 25 Oct ruling.
- `node_modules`: each new worktree symlinks one from an existing worktree, so never run npm install. Bubbles
  uses /home/user/wt-bubbles-stepb/node_modules; Sunny uses /home/user/wt-sunny-audit/node_modules. On a new
  machine, run `npm ci` once.

## Files here

- `scripts/suite.sh`: runs the full suite with the JSON reporter and prints passed/failed counts and the head.
  `$SCRATCH` is a scratch dir.
- `scripts/audit.sh`: classifies PRs (ahead count, flags new vs on main, conflicts).
- `scripts/bisect.sh`: finds the minimal set of production flags that makes a test fail.
- `BRIEF.md`: the brief for the October triage agents.
- `REBUILD-BRIEF.md`: the brief for the October rebuild agents.
- `oct-triage/*.md`: the per-slice triage tables (also in PRs #715/#796). Names are invented.

## Rebuild item #4: the Issue/Observation field cut or polluted (WIP: finish, check, rename branch, then PR)

| App | WIP branch | Head | Flag | Supersedes | State |
|---|---|---|---|---|---|
| Bubbles | claude/incident-split-fix-rebuild-wip | 75b23fa4 | INCIDENT_SPLIT_FIX | #189 | Fix and tests written; 4 replay cases. Still to re-run: lint, tsc, the 11 Issue-reader test files with the flag on and off, and the replay checks. Then make a final commit and push to `claude/incident-split-fix-rebuild`. |
| Sunny | claude/incident-split-fix-rebuild-wip | 5e969845 | INCIDENT_SPLIT_FIX | #257 | `ai/observation-turns.ts`, hooked in `keep-filled-slots.ts`. 16 unit tests; 2 open replay cases plus 1 guard. Lint is done; still to run: tsc, flags-off-parity, keep-filled-slots*, edit-date-rules*. |
| Sunny | (not started) | – | INCIDENT_CLAUSE_SPLIT | #260 | Reproduced on main ("…our kearney, ne salon as a tan consultant and was late today" gives the Observation "ne salon as a tan consultant and was late today"; "…the policy violated is late opening, not attendance" stays). Old commits on `origin/pr-260`: 876103e8, 27ed0693, c5183cf9. Bubbles' `forms/incident-clauses.ts` is on its main. |
| Sunny | claude/write-up-observation-rebuild-wip | 2d86f90d | WRITE_UP_LEAD_NOT_ACCOUNT (new) | #167, Observation part | "write up <employee> for cell phone use" now gives the Observation "Cell phone use". 10 unit tests; replay case. Lint and tsc pass; flags-off-parity still to run. |
| Sunny | claude/title-not-in-observation-rebuild-wip | 4f95af07 | TITLE_NOT_IN_OBSERVATION (new) | #207, title-in-Observation part | "she is an HR assistant" is left out of the Observation. 8 unit tests; replay case. Still to run: lint, tsc, flags-off-parity. |

Decisions for QA in item #4:

- **"Hr Assistant" as the card title (#207).** This is a separate title-reader bug, the old STATED_TITLE_WINS item, and
  needs its own flag. It is not fixed here.
- **Bubbles #189 rule.** A later turn never replaces the account the request already gave. With the flag on, this
  changes main's issue-after-request-reason test: a later "she was 30 minutes late on 11/3, it should be attendance"
  after a sales account no longer becomes the Issue. That test is flag-aware with a comment; QA should confirm.
- **Not yet checked: Bubbles for the #167 and #207 Observation bugs.** Look first at `withObservation` / `withAccount`
  in `keep-filled-slots.ts` and `managerAccount` in `remap-incident.ts`.

Branches still on earlier work, already pushed and listed above:
- The Sunny brand-scan suite was mid-run at migration.
- The b-rel, s-rel and b-gate suites never ran.
