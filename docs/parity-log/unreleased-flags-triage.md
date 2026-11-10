# Unreleased flags triage (Ask Bubbles, audit item 18, 10 Nov 2026)

QA's audit item 18: every `*_ENABLED` flag the code reads that is in none of
`src/config/production-flags.json`'s lists (`on`, `assumedOn`, `off`).

**How the list was computed.** On `main` `145fef8f4f`: every `*_ENABLED` name in
non-test `src/**/*.ts(x)` (test files and `src/app/api/chat/replay-pack/` left
out), minus every name in the three lists. That gives **55** names: the 51
triaged below, plus 4 integration/ops switches the file leaves out on purpose
("Only *_ENABLED chat flags; integrations (Woven, Google reviews) are left out"),
which are not triaged here and stay off-list (K):
`FORMS_TEMPLATE_SYNC_ENABLED`, `NEW_HIRE_INVITES_ENABLED`,
`WOVEN_HANDBOOK_DOWNLOAD_ENABLED`, `WOVEN_SYNC_WRITES_ENABLED` (the last is
named in `_about` as left out, sensitive).

**Sibling column.** The sibling app's `production-flags.json` (worktree at
`ccfbe214`) is a full read of its Vercel production: `on`, `off`, `unlisted`
(its code reads the flag but production does not set it, so off), or
`not in code` (the sibling worktree does not read this name; some newer flags
marked "same flag in both apps" may be on the sibling's `main` after `ccfbe214`).
Note: `ANTI_LOOP_ENABLED` is **not** on in the sibling; the sibling never had it.

**Origin.** The oldest commit adding the name under `src`. `#425 (import)` is the
commit that imported this repository's history (2,204 files); for those, the
October pull request is named where `docs/parity-log/oct-pr-triage.md` gives one.

**Counts (51):** R 7 · R? 23 · X 4 · K 11 · K? 4 · ? 2.
R = release candidate; X = retire; K = keep off on purpose; `?` = uncertain,
with what would decide it.

No code is changed and no flag or file is deleted here. Verdicts are for QA;
only QA reads or flips Vercel.

**On in the sibling's production, absent from this app's lists (13).** Three of
them are known off here: `COACHING_ASKS_WHAT_HAPPENED_ENABLED` and
`POLICY_CITATION_ENABLED` (both named as staying off in `_about`) and
`DRAFT_DEDUPE_ENABLED` (not set here, QA's Vercel read of 7 Nov 2026,
`docs/parity-log/2026-11-07-second-request-own-account.md`). For QA to check
against Vercel, the other ten:

- `CHAT_STYLE_RULES_ENABLED`
- `DRAFT_MERGE_ENABLED` (the same switch as this app's `DRAFT_EDIT_MERGE_ENABLED`)
- `FEWSHOT_EXAMPLES_ENABLED`
- `FOLLOWUP_NEW_TOPIC_RETRIEVAL_ENABLED`
- `INTENT_PAYROLL_MANAGER_ONLY_ENABLED`
- `LONG_CONTEXT_ENABLED`
- `NEXT_PUBLIC_ASD_NO_FORM_MONITORING_ENABLED` (verdict X here: superseded)
- `QUERY_REWRITE_ENABLED`
- `RETRIEVAL_RECALL_ENABLED`
- `SECOND_FORM_ENABLED`

| Flag | What it does | Origin | Sibling | Verdict | Evidence / replaced by / why |
| --- | --- | --- | --- | --- | --- |
| CHAT_IMPORT_PROVEN_OWN_ENABLED | Importing a chat this account does not hold must prove every answered turn is its own; else declined | #425 (import) | unlisted | R | Independent review, 31 Oct 2026 (`docs/parity-log.md`): another account's chat could still be imported on a shared browser. Security fix, both apps. No replay case (import route, not chat). |
| COACHING_ASKS_WHAT_HAPPENED_ENABLED | A Coaching Form card with no account in the manager's turns asks what happened instead of saying it has everything | d5a0159 | on | R | Replay `nov5-twin-sf-s27-coaching-name-only-asks-what-happened`. `_about` round 16b: stays off, ships together with ONE_FORM_EACH_PERSON. Known off here. |
| EXCERPT_BRAND_FILTER_ENABLED | A source excerpt never quotes lines of the manual that name a hidden (sibling) brand | #425 (import); PR #163 | not in code | R | QA B22-4 (25 Oct): an excerpt quoted another company's PTO bullet. Oct triage: code on main, flag not on in production. This app only. No replay case. |
| INCIDENT_FROM_EARLIER_TURN_ENABLED | A question about the Corrective Action that says what happened counts as the account | 276a9e9 | not in code | R | Replay `nov5-twin-sf-s28-incident-from-previous-turn` (fixFlags). Owner's report sf-s28, 5 Nov 2026. |
| ONE_FORM_EACH_PERSON_ENABLED | "Coaching form for A, B and C" makes one form each, with a "Next:" line | a529c29 | not in code | R | Replay `nov10-p7-one-form-each-named`, `nov10-p7-unanswered-which-tamsin-asked-again`. `_about` round 16b: held back to ship with COACHING_ASKS_WHAT_HAPPENED. |
| STEP_B_ADD_UNDER_OBSERVED_ENABLED | An "add" to a sectioned Details field goes at the end of Observed, not after Going Forward | b818003 | not in code | R | QA's live draft test on this app's production, 8 Nov 2026. Replay `nov8-step-b-add-under-observed`, `nov8-step-b-whole-text-tail`. Its partner STEP_B_SECTION_SPACING is already on. |
| STEP_B_REPLY_KEEPS_LINES_ENABLED | Step B's reply quotes a multi-line field line by line, not joined with "; " | 7c92f76 (#582 batch) | not in code | R | QA's live draft test, 8 Nov 2026. Replay `nov8-step-b-reply-keeps-lines` (fixFlags). |
| CHAT_LONG_MESSAGE_ENABLED | Chat messages up to 12,000 characters instead of 4,000; over-limit is a 400, nothing cut | #425 (import); PR #153 | unlisted | R? | Oct triage: messages over 4,000 were cut; code on main, flag not on. Flip with NEXT_PUBLIC_CHAT_LONG_MESSAGE. No replay case. Decided by whether long pastes are still a live complaint. |
| CHAT_STYLE_RULES_ENABLED | Extra system-prompt rules for names, payroll and a chosen corrective action | #425 (import) | on | R? | On in the sibling; unlisted here: check Vercel. No replay case. |
| DRAFT_EDIT_MERGE_ENABLED | Draft edits merge into existing fields; an empty edit never blanks Offense or the Action Plan | #425 (import) | not in code | R? | Same switch as DRAFT_MERGE (`draftEditMergeEnabled` reads both). Draft route only (`retainFilledFields`). Check Vercel for either name. No replay case. |
| DRAFT_MERGE_ENABLED | The sibling's name for DRAFT_EDIT_MERGE | #425 (import) | on | R? | On in the sibling; unlisted here: check Vercel. Retire one of the two names once QA knows which is set. |
| EXIT_PROSE_FACTS_ENABLED | Exit form prose and Additional Details say only what the manager said (date, notice, call-in) | #425 (import); PR #195 | not in code | R? | Oct triage (b): live bug, base guard needs this flag; even on, #195's own cases still fail. Needs #195's addition before it fully fixes it. No replay case. |
| FEWSHOT_EXAMPLES_ENABLED | Similar 5-star exchanges added to the system prompt | #425 (import) | on | R? | On in the sibling; unlisted here: check Vercel (reads `chat_traces`, migration present). No replay case. |
| FOLLOWUP_NEW_TOPIC_RETRIEVAL_ENABLED | A follow-up naming its own documents is searched on them, not only on the earlier subject | #425 (import); PR #147 | on | R? | On in the sibling. Oct triage: code on main, "not on in production". Check Vercel. No replay case. |
| FORM_EDIT_NOOP_GUARD_ENABLED | No false "Updated": a same-value or whole-message op is refused; the reply is the saved diff | d55575c (Step 4) | unlisted | R? | Replay `nov4-noop-guard-same-value-edit`. Classification (`docs/flag-classification/FORM_EDIT_NOOP_GUARD_ENABLED.md`) run with the tool on: 51 INTENDED, 0 REGRESSION. Flip with FORM_EDIT_TOOL_IN_STREAM. |
| FORM_EDIT_TOOL_IN_STREAM_ENABLED | `edit_form` offered in the main call while a draft is open; reply is the saved diff | #425 (import); A3 on #427 | unlisted | R? | Replay `nov4-edit-tool-ca-t2-drops-marnie`, `nov4-edit-tool-ca-t6-append`, gate cases; fixes OPEN cases b13, b17, daily-stats. Pending follow-ups in its classification doc (b15 script by turn, flaky rerun). |
| FRAMEWORK_GENERAL_SECTIONS_ENABLED | Coaching framework answers from its general sections instead of "the knowledge base does not have it" | #425 (import) | unlisted | R? | QA conversation report. No replay case. Decided by a replay of that question. |
| INCIDENT_CLAUSE_SPLIT_ENABLED | The card's Issue is read from clauses that say what happened, not title/store/policy text | #425 (import); PR #192 | not in code | R? | Oct triage: "The Issue is a fragment of the turn"; code on main, flag not on. No replay case. Later Issue fixes may cover it: a replay of #192's wording decides. |
| INTENT_PAYROLL_MANAGER_ONLY_ENABLED | Payroll amount and Yes/No read only from the manager's turns, not the assistant's policy quote | #425 (import) | on | R? | Production bug 24 Oct ("verbal, no payroll" saved $25, Yes). On in the sibling; unlisted here: check Vercel. No replay case. |
| LONG_CONTEXT_ENABLED | Longer history window plus a stored summary of older turns | #425 (import) | on | R? | On in the sibling; unlisted here: check Vercel (`chat_context_summaries` migration present). No replay case. |
| NEXT_PUBLIC_CHAT_LONG_MESSAGE_ENABLED | Browser twin of CHAT_LONG_MESSAGE (composer limit) | #425 (import); PR #153 | not in code | R? | Must flip with CHAT_LONG_MESSAGE; the server reads either name. |
| NEXT_PUBLIC_INVITED_SIGNIN_ACCEPTS_ENABLED | A successful password sign-in also accepts a pending invitation (invited to active) | #425 (import) | unlisted | R? | 28 Oct 2026, both apps: accounts stayed "invited" after a mail scanner spent the link. Auth, not chat; no replay case. Independent of INVITE_LINK_HOLD. |
| POLICY_CITATION_ENABLED | Writes a JBA Policy Manual name and printed page onto coaching forms / empty CA policy line | #425 (import) | on | R? | Known off: `_about` "stays off until the card-policy name fix is ported". Replay `nov5-cleaning-other-sf-s15-policy-citation`, `nov5-upkeep-other-policy-citation`, `nov7-s37-second-card-own-policy`, `nov8-560-*-name-keeps-policy`. QA confirms the fix landed (CARD_POLICY_OWN_REQUEST is on). |
| PRIOR_RECORD_FINAL_ONLY_ENABLED | A previous/prior coaching question lists only finalized forms; drafts in a separate section | #425 (import) | not in code | R? | A draft is never described as previous coaching (`docs/parity-log.md`). This app only. No replay case. |
| QUERY_REWRITE_ENABLED | Retrieval query rewritten into manual terms from the conversation | #425 (import) | on | R? | On in the sibling; unlisted here: check Vercel. FOLLOWUP_NEW_TOPIC_RETRIEVAL builds on it. No replay case. |
| REFORMAT_KEEPS_SOURCES_ENABLED | "Put that in a table" keeps the sources of the answer it reformats | #425 (import) | unlisted | R? | Ported from the sibling, where it is unset too. No replay case. Decided by whether reformat turns still "correct" claims. |
| RESIGN_METHOD_FOLLOWUP_ENABLED | How Employee Resigned reads "told me verbally" / "verbal notice" as Verbal | #425 (import); PR #150 | unlisted | R? | Owner's decision 25 Oct. Oct triage: code on main, flag not on. No replay case. |
| RETRIEVAL_RECALL_ENABLED | Top-N keyword+vector candidates, fuzzy titles and a Haiku pick, no similarity floor | #425 (import) | on | R? | On in the sibling; unlisted here: check Vercel. Takes precedence over HYBRID_SEARCH in `server-ask.ts`. No replay case. |
| SECOND_FORM_ENABLED | A follow-up or second document is not revised into the form on screen | #425 (import) | on | R? | On in the sibling; unlisted here: check Vercel. `nov5-coding3-same-form-other-employee` notes it does not change that case. No replay case of its own. |
| TRUNCATION_RETRY_BUDGET_ENABLED | A cut-off answer whose first try took over 50 s starts no retry (stays under 120 s) | #425 (import) | unlisted | R? | Sibling's live QA, 1 Nov 2026 (same flag in both apps); unset there too. No replay case. Decided by timeout logs here. |
| ACTION_PLAN_MANAGER_ONLY_ENABLED | The Action Plan is only what the manager typed, or blank | #425 (import) | off | X | Owner ruled 5 Nov 2026 the AI should write the Action Plan; flag "stays off in both apps" (`nov3-step-b-cases.ts`). Replaced by: ACTION_PLAN_SENTENCES (assumedOn). |
| CROSS_CHAT_DRAFT_DEDUPE_ENABLED | Reuses an open draft for the same employee/template/date from another chat or manager | #425 (import) | not in code | X | Contradicts the B18/B19 rollback (another chat's draft reopened/overwritten). Replaced by DRAFT_REUSE_SAME_CHAT_ONLY (assumedOn): a draft from another chat is never reopened. |
| NEXT_PUBLIC_ASD_NO_FORM_MONITORING_ENABLED | Assistant Manager loses the Forms Register | #425 (import) | on | X | Owner: "lift the block". Superseded by NEXT_PUBLIC_ASSISTANT_MANAGER_CREATE (on): register kept, own forms only; with it on this flag has no effect (`config/company/access.ts`). Sibling-company use stays there. |
| POLICY_CLEANING_INCIDENT_ENABLED | Cleaning left undone cites Care and Cleaning of Equipment and Facilities | 794b374 | unlisted | X | Oct triage (c) obsolete: owner's 6 Nov ruling makes it Other. Replaced by CA_SALES_POLICY + CLEANING_OTHER_EVERY_WORDING (both on). |
| DRAFT_DEDUPE_ENABLED | A resent create for the same employee/form/incident reopens that draft | #425 (import) | on | K | Not set here (QA's Vercel read, 7 Nov). In the sibling it reopened the first draft for a second CA; the port waits behind SECOND_REQUEST_OWN_ACCOUNT (off). Keep off until that ships. |
| EDITION_SUPERSESSION_ENABLED | Woven sync keeps only the newest edition of a revised document in search | #425 (import) | not in code | K | Knowledge-sync switch, outside this file's chat scope ("Woven left out"). Ops decision; check Vercel. |
| FORM_REVISIONS_ENABLED | Finalized-form edits need a reason; revision chain on PDF and form view | #425 (import) | unlisted | K | Feature awaiting a decision; unset in the sibling too. Must flip with NEXT_PUBLIC_FORM_REVISIONS (server refuses an edit with no reason; only the browser flag asks). |
| GOOGLE_REVIEWS_IN_CHAT_ENABLED | Google review questions get month-to-date figures, goal and pace for the caller's stores | #425 (import) | unlisted | K | Integration: `_about` leaves Google reviews out on purpose. Check Vercel; not a chat-flags entry. |
| HYBRID_SEARCH_ENABLED | Keyword + vector fusion via `match_knowledge_chunks_hybrid` | #425 (import) | off | K | Verified off in the sibling. RETRIEVAL_RECALL wins over it when both are on (`server-ask.ts`). |
| INVITE_LINK_HOLD_ENABLED | Invite link held on GET and verified only on Continue (scanner-safe) | #425 (import) | unlisted | K | Ops: nothing links to the routes until the Supabase Invite template is changed (`invite-hold-flag.ts`). Flip with that template change. |
| NEAR_MISS_DETAILS_ACCEPT_ENABLED | After "Is this for <roster name>?", a turn with form details accepts the asked name | a4df2ec (#555 batch) | unlisted | K | Only acts with FORM_NAME_FROM_ROSTER on, which is off since 7 Nov (`_about`). Replay `nov7-near-miss-details-*`. Ship with FORM_NAME_FROM_ROSTER. |
| NEXT_PUBLIC_FORM_REVISIONS_ENABLED | Browser twin of FORM_REVISIONS (reason dialog, revision marks, history) | #425 (import) | unlisted | K | Flips only with FORM_REVISIONS. |
| POLICY_CITATION_CHECK_ENABLED | Code checks every manual quote, heading and page against retrieved chunks | #425 (import) | not in code | K | Scaffold (Step A, 3 Nov): "Nothing reads it yet"; its getter has no caller. Keep off until wired. |
| PRIOR_COACHING_OPTIONAL_ENABLED | A Corrective Action may be created with no prior coaching form in the app | #425 (import) | off | K | Verified off in the sibling. `nov5-coding3-bubbles-ca-twin` shows it writes a misleading "on file" note; fixed separately by PRIOR_COACHING_DENIAL. |
| PRIVATE_CREATOR_FORMS_ENABLED | Forms created by listed accounts are seen only by them and admin | #425 (import) | unlisted | K | Ops/access switch: needs PRIVATE_FORM_CREATOR_IDS set in Vercel; with an empty list nothing changes. Check Vercel. |
| CHAT_DATA_TOOLS_ENABLED | Read-only review/report tools and the password-reset help text in chat | #425 (import) | unlisted | K? | "Defaults off in both apps"; unset in the sibling. Awaiting a product decision. |
| CHAT_MEMORY_ENABLED | Per-user memory tools and a recalled-memory prompt block | #425 (import) | unlisted | K? | Unset in the sibling; product/privacy decision (`user_memory` migration present). |
| FORM_TOOLS_ENABLED | Claude tool-use reading of a form turn, routed off search | #425 (import) | off | K? | Verified off in the sibling; the later edit tool (FORM_EDIT_TOOL_IN_STREAM) may replace it. X if QA confirms. |
| REPORT_BREAKDOWN_ENABLED | Grouped Comp Report, Sales Totals and review breakdowns in chat | #425 (import) | unlisted | K? | Only matters with CHAT_DATA_TOOLS; unset in the sibling. Decided with CHAT_DATA_TOOLS. |
| ANTI_LOOP_ENABLED | Bundle of anti-loop rules (employee kept in code, ISO dates, printed-page map, no "Did you mean") | #425 (import) | not in code | ? | Off live since 24 Oct (`_about`); the other flags of its round are assumedOn; many parts since shipped as name flags (OFF_ROSTER_*, ROSTER_*, PARTIAL_SURNAME_ASK). 11 readers. X or K: a flag-classify run against today's production flags decides. |
| CA_POLICY_RETRIEVAL_ENABLED | CA/policy questions prefer the current manual and the section a synonym names | #425 (import) | not in code | ? | This app only; may overlap FULL_MANUAL_CONTEXT and POLICY_SPECIFIC_TOPICS (assumedOn). A replay of a synonym question ("insubordination", "tardy") decides R or X. |
