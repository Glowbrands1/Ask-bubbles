# Replay scoreboard

Local harness only. `proposeFormForTurn`, temperature 0, empty roster, owner
with global scope, today 2026-10-24. The model is the configured answering
model and is not called. Each case is replayed once. A case passes when
that run passes. Flags-off is the same card rules and is allowed to fail them.

Pass criteria were written in `src/lib/ai/replay-set.json` before the run.
They are judged on the card: employee, store, date, policy and printed page,
no blocking question, no leaked internal text, and latency under 8000ms.
A blank first message is a harness event (`dropped_first_message`), not a
case failure. This run had no harness events.

## Round — anti-loop — 24 Oct 2026

| | |
| --- | --- |
| replay_set.json | `b880bb5d80810302ac9ece8c5042f9cae1104eef10ee538516871be4ac3970fe` |
| commit | `dfb988d7e90e267be96fe9f722a2bd539eab49b5` |
| prompt hash, flags on | `13a74bd2194bab22c8aed6628f9383a5aee4ad4d60e67e1f46d374e37adf8e9e` |
| prompt hash, flags off | `b70bdf29016c52e5857240b7eb2323dcd0f40600c005e9b36172638c72b87878` |
| flag set, on | `TYPED_NAME_ENABLED`, `ACTION_PLAN_SENTENCES_ENABLED`, `PRINTED_PAGE_ONLY_ENABLED`, `POLICY_CITATION_ENABLED`, `PAYROLL_DEDUCT_AMOUNT_ENABLED`, `ANTI_LOOP_ENABLED` |
| flag set, off | none of those |
| model | `claude-sonnet-5` (configured, not called) |
| runner | `proposeFormForTurn` |
| temperature | 0 |
| runs | 1 flags-on, 1 flags-off |

| Case | Flags off | Flags on |
| --- | --- | --- |
| b9 Test Employee, written CA | FAIL. No employee on the card. Turns 1 and 3 ask who. | PASS. Slowest run 156ms. |
| b10 Testy Testerson, Dodge, measuring | FAIL. Turn 1 has no employee. "show draft" has no card. The incident is treated as missing. | PASS. Slowest run 79ms. |
| b11 Testy Testerson, late, Attendance | FAIL. Asks which of NE, Testy Testerson, or JBA Manual. | PASS. Slowest run 10ms. |
| b12 Sadie Hoffart, Empire SD | FAIL. No employee. Turn 5 reads Store Director and asks who. | PASS. Slowest run 55ms. Store blank. Animals in the Workplace p.30. Visitors not required. |

The five-flag replay without `ANTI_LOOP_ENABLED` is unchanged: b9–b11 pass,
and b12 still asks once with the two Sioux Falls stores and still misses
Visitors in the Workplace. That miss stays. This round does not require
Visitors. Animals in the Workplace p.30 is required because the manager
names that heading.

## Round — prompt A/B — 24 Oct 2026

The last-known-good system prompt is `buildSystemPrompt` at `655a61d`,
the parent of `295d573`. That commit is the only edit to `prompts.ts`
after main. It added the typed-name rule and the printed-page citation
rule. Both arms use the current code and the six flags above. The card
runner does not read the system prompt. The old prompt did not score
better on any case, so those sections stay.

| | |
| --- | --- |
| replay_set.json | `b880bb5d80810302ac9ece8c5042f9cae1104eef10ee538516871be4ac3970fe` |
| commit | `9ce0c202dd75f2f45b55a097502389e5f0638b27` |
| last-known-good prompt | `655a61dbebccd34405b53e40e0566a294120b0b8` |
| prompt hash, current | `13a74bd2194bab22c8aed6628f9383a5aee4ad4d60e67e1f46d374e37adf8e9e` |
| prompt hash, last-known-good | `b70bdf29016c52e5857240b7eb2323dcd0f40600c005e9b36172638c72b87878` |
| flag set, both arms | `TYPED_NAME_ENABLED`, `ACTION_PLAN_SENTENCES_ENABLED`, `PRINTED_PAGE_ONLY_ENABLED`, `POLICY_CITATION_ENABLED`, `PAYROLL_DEDUCT_AMOUNT_ENABLED`, `ANTI_LOOP_ENABLED` |
| model | `claude-sonnet-5` (configured, not called) |
| runner | `proposeFormForTurn` |
| temperature | 0 |
| runs | 1 per arm |

| Case | Last-known-good prompt | Current prompt |
| --- | --- | --- |
| b9 Test Employee, written CA | PASS. Slowest run 25ms. | PASS. Slowest run 153ms. |
| b10 Testy Testerson, Dodge, measuring | PASS. Slowest run 58ms. | PASS. Slowest run 78ms. |
| b11 Testy Testerson, late, Attendance | PASS. Slowest run 7ms. | PASS. Slowest run 10ms. |
| b12 Sadie Hoffart, Empire SD | PASS. Slowest run 48ms. | PASS. Slowest run 55ms. |

No prompt section was reverted. The fixes stay in code.

## Round — guide v3, old behaviour against the rulebook flags — 24 Oct 2026

The 18 turns are the Buff City cases b9–b12 and the 14 adapted chats, word
for word, one run each. Local harness only. Empty roster. Owner with
global scope. Today 2026-10-24. The model is not called. A rule counts on
that run.

Scored against the guide: employee on the card, the typed name kept, store
not a gate, the date the manager gave, policy name and printed page, a
two-sentence action plan with no payroll sentence, a payroll amount only
when the manager stated one, no blocking question, no leaked repair text,
and the case under 8000ms.

| | |
| --- | --- |
| OLD | `main` `655a61dbebccd34405b53e40e0566a294120b0b8`, every flag off |
| NEW | `73bbd8421e3d749849d554293f93d68062496cc8`, `TYPED_NAME_ENABLED`, `ACTION_PLAN_SENTENCES_ENABLED`, `PRINTED_PAGE_ONLY_ENABLED`, `POLICY_CITATION_ENABLED`, `PAYROLL_DEDUCT_AMOUNT_ENABLED`, `ANTI_LOOP_ENABLED` |
| runs | 1 per case, per column |
| latency | slowest case 57ms. Budget 8000ms. Both columns pass it. |

| Case | OLD | NEW | |
| --- | --- | --- | --- |
| b9 Test Employee | FAIL. No name. Asks who. No plan. Standards of Conduct page missing. | FAIL. Name, date, blank store, and the two-sentence plan are kept. The printed page is not in the reply. | better |
| b10 Testy Testerson, Dodge | FAIL. Name and Dodge are kept. No plan. Page missing. | FAIL. Plan is two sentences. Page missing. | better |
| b11 Testy Testerson, Attendance | FAIL. No name. No plan. Page missing. | FAIL. Name, Dodge, 2026-10-20, and the plan are kept. Page missing. | better |
| b12 Sadie Hoffart | FAIL. No name. Role read as Store Director. Date 2025-11-01. Asks who. | FAIL. Typed name, 2026-10-22, blank store, and the plan are kept. Page missing. | better |
| s4 Test Testy, Kearney, $25 | FAIL. No plan. No payroll amount. Page missing. | FAIL. Plan is two sentences and does not contain the amount. $25 is in the reply and not on the payroll amount line. Page missing. | better |
| s9 Ima Employee | FAIL. Name shortened to ima. Date is the prior coaching. No plan. | FAIL. Full name kept. Date is still 2026-09-01. Page missing. | better |
| s11 Casey Quinn, Bellevue | FAIL. Employee read as bellevue. No store. | FAIL. casey quinn stays. The store is still blank. Cell Phone page missing. | better |
| s5 Dana Moss | FAIL. Name is dana. Asks which store. No date. | FAIL. Store is Bellevue and nothing asks which store. Name is still dana. No date. | better |
| s27 Pat Rivera | FAIL. Employee is Sam Lee. Asks which store and who. No plan. | FAIL. No store question. Employee is still Sam Lee. No date. Page missing. | better |
| s28 Pat Rivera | FAIL. Asks which store. No plan. Page missing. | FAIL. Name and 2026-09-28 kept. Page missing. | better |
| s29 Pat Rivera | FAIL. Asks which store. No plan. | PASS. | better |
| s17 Riley Quinn | FAIL. Asks which store. No date. No plan. | FAIL. Name and plan kept. Date missing. | better |
| s20 worksheet, then exit | PASS. No false employee. | PASS. | same |
| s21 Alex Morgan | FAIL. No plan. No store chosen. | FAIL. Plan kept. Store stays blank, and the reply does not ask which store. | better |
| s25 Jamye Cole | FAIL. Asks who. Asks which store. No plan. | PASS. | better |
| s8 Morgan Blake, exit | FAIL. No name. Asks who. Date missing. | FAIL. Same misses. Lee's Summit is on the card. | same |
| s12 Casey Quinn, exit | FAIL. Date missing. | FAIL. Name and Kearney kept. Date missing. | same |
| s16 Quinn Adler, exit | FAIL. Date missing. | FAIL. Name and Kearney kept. Date missing. | same |

14 better, 4 same, 0 worse. Nothing on NEW fails a rule that OLD passed.
The one case that asked which store after the name was dropped, s11, keeps
casey quinn. A city from this company's store list, followed by a job title,
is not the employee.

## Round 1 — name, date slot, and store — 24 Oct 2026

Compared with the guide v3 NEW column above. Same 18 cases, same wording,
1 run, local harness only (in-memory database, model not called). The
preview deployment was not used: it shares the production database.

Flag set for this replay, assigned explicitly:

| Variable | Value |
| --- | --- |
| `TYPED_NAME_ENABLED` | `1` |
| `ACTION_PLAN_SENTENCES_ENABLED` | `1` |
| `PRINTED_PAGE_ONLY_ENABLED` | `1` |
| `POLICY_CITATION_ENABLED` | `1` |
| `PAYROLL_DEDUCT_AMOUNT_ENABLED` | `1` |
| `ANTI_LOOP_ENABLED` | `1` |
| `SELF_CHECK_ENABLED` | `false` |

`false` is off. Self-check does not run. No other chat-quality flag was set.

Targeted cases: s5, s8, s9, s11, s12, s16, s17, s21, s27.

| Case | Before | Round 1 | |
| --- | --- | --- | --- |
| b9 | FAIL. Page missing. | FAIL. Same page miss. Name, date, blank store kept. | same |
| b10 | FAIL. Page missing. | FAIL. Same page miss. | same |
| b11 | FAIL. Page missing. | FAIL. Same page miss. | same |
| b12 | FAIL. Page missing. | FAIL. Same page miss. Blank store kept. | same |
| s4 | FAIL. Payroll line and page. | FAIL. Same two misses. | same |
| s9 | FAIL. Date 2026-09-01. Page missing. | FAIL. Date is 2026-09-28. Page still missing. | fixed date |
| s11 | FAIL. Store blank. Page missing. | FAIL. Store is Bellevue loc-67. Page still missing. | fixed store |
| s5 | FAIL. Name dana. No date. | PASS. dana moss, 2026-10-24, Bellevue. | fixed |
| s27 | FAIL. Employee Sam Lee. No date. Page missing. | FAIL. Pat Rivera, 2026-10-16. Page still missing. | fixed name and date |
| s28 | FAIL. Page missing. | FAIL. Same page miss. Pat Rivera and 2026-09-28 kept. | same |
| s29 | PASS. | PASS. | same |
| s17 | FAIL. No date. | PASS. 2026-10-24. | fixed |
| s20 | PASS. | PASS. | same |
| s21 | FAIL. Store blank. | PASS. Primary store Sioux Falls W 41st loc-225. | fixed |
| s25 | PASS. | PASS. | same |
| s8 | FAIL. No name. Asks who. No date. | PASS. morgan blake, 2026-09-20, Lee's Summit. | fixed |
| s12 | FAIL. No date. | PASS. 2026-09-28. | fixed |
| s16 | FAIL. No date. | PASS. 2026-10-09. | fixed |

6 cases that were failing now pass (s5, s8, s12, s16, s17, s21). s9, s11,
and s27 each lost a failing rule and gained none. s20, s25, and s29 still
pass. No case gained a miss. No reply leaked repair text. The slowest case
is 149ms against a previous max of 150ms. Every case stays within 25% of
its previous max (the largest move is b11, 10ms to 12ms). Policy pages and
the s4 payroll amount line are unchanged and were not this round.

Replayed again on `3d3f3fd` with the flag values in the table above,
`SELF_CHECK_ENABLED=false`. Same pass and fail on every case. No new miss.
Slowest case 150ms. Largest move against the round above is b10, 78ms to 80ms.

## Job title is a title — 24 Oct 2026

`ANTI_LOOP_ENABLED` and `TYPED_NAME_ENABLED` on, `SELF_CHECK_ENABLED` unset.
Local harness, empty roster, model not called. Sunny s8 and s17, with this
company's titles and stores.

| Case | Employee | Job Title | Not the employee |
| --- | --- | --- | --- |
| s8 Morgan Blake, exit, Lee's Summit | morgan blake | Team Member | job title |
| s17 Riley Quinn, performance CA | Riley Quinn | Team Member | job title, september, based |
| Riley Quinn, `Job Title: Floor Lead` | Riley Quinn | Floor Lead | job title, and the words after the label |

"Job Title", "title", "position", "location", "store", and "date" are
stripped from employee-name candidates. The words after "job title" are
the Job Title slot. The earlier round 1 cases in
`src/lib/ai/name-slot-store.test.ts` still pass.

`name-words.ts` now treats job, title, position, role, location, salon,
and store as label words. A trailing "Job" or "Title" is removed only
after a full name, so "Store Director" stays. The value after "Name:"
is the employee. s8 (Morgan Blake), s17 (Riley Quinn), and
"Name: Christiana Headley, job title tanning consultant" keep that name.
"Tanning consultant" is the typed title on that line. It is not a Buff
City job title. A label rejects a candidate only when the candidate is
the label itself. "Job title" is not an employee. "Jane Store" is, and
the card replay keeps that name, at Kearney, dated 2026-10-24. "Jane
Salon" is kept by the same reader.

## Validation port — 24 Oct 2026

Local tests only. No production query, no migration applied, model not
called. `SELF_CHECK_ENABLED` unset. New flags default off.

| Check | Flag off | Flag on |
| --- | --- | --- |
| "CA for insubordination, she did not acknowledge policies at onboarding" | Standards of Conduct outside the top 14 | Standards of Conduct is first of the top 14 |
| slippers / wrong uniform | Dress Code stays outside the top 14 | Dress Code for The Company leads |
| "employee was tardy, showed up late for shift again" | Attendance outside the top 14 | Attendance leads |
| "opening the store late" / "store opened late" | Late Opening outside the top 14 (rank 18) | Late Opening leads (rank 1) |
| "policy acknowledgements" | Standards of Conduct outside the top 14 (rank 15) | Standards of Conduct leads (rank 1) |
| previous coachings | draft stays in the list, labelled "draft — not finalized" | finalized row stays on file; draft is a separate "Not on file" section and is not previous coaching |
| "any draft coachings for wren halvorsen" | drafts listed in the on-file list | drafts listed under "Not on file", never as previous coaching |

Fixture order before the boost: ranks 1–14 Performance Framework, 15 Standards of Conduct, 16 Attendance, 17 Dress Code for The Company, 18 Late Opening. After the full-list reorder:

| Prompt | Standards of Conduct | Dress Code for The Company |
| --- | --- | --- |
| before any prompt | 15 (outside the top 14) | 17 (outside the top 14) |
| "write a CA for slippers and the wrong uniform" | 2 | 1 |
| "CA for insubordination, she did not acknowledge policies at onboarding" | 1 | 3 |
| "policy acknowledgements" | 1 | 3 |

Seventeen plain-language prompts are in `src/lib/knowledge/ca-policy-retrieval.test.ts`. `research/reports/full-validation-2026-10-24.md` was not in this checkout, so the set is the stakeholder cues, the Sunny rewrite questions with salon wording adapted to a store, and the phrases "store opened late" and "policy acknowledgements". The synonym map covers both phrases. Hybrid search is scored only in `src/lib/knowledge/ca-policy-hybrid.local.test.ts` on an in-memory candidate list. That test does not call the database or an embedder. The same before/after ranks hold there once the flag widens the pool.
| district_manager, global, no store | "won't name one", card ready | asked once, card stays ready, not needs_location |
| admin / owner, global | "won't name one" | still not asked |
| district_manager names Kearney | store loc-66 | no ask |
| Empire, SD | not a store | still not a store; the ask remains |
| open draft, same employee, template, incident date, other chat | creates | reuses; card-id match still wins |

## Newest Woven edition — 24 Oct 2026

`EDITION_SUPERSESSION_ENABLED` defaults off. Local harness only: the fake
Woven in `src/lib/knowledge-sync/woven/reference/sync.test.ts`, the memory
sink, and pure planners. No production query, no migration applied, no
embedder. Preview writes no manifest and no document.

| Check | Flag off | Flag on |
| --- | --- | --- |
| 2024 JBA manual plus two May 2025 copies | all three indexed | May 2025 copies indexed; 2024 held as `older_edition` and not searchable |
| 2024 file already indexed, then its bytes and updated time change | would ingest the change | version stays 1, row stays superseded, bytes unchanged |
| superseded record re-sent alone, bytes changed | re-indexed and current again | version stays 1, `superseded_by` stays, not searchable |
| same bytes filed under a new Woven record | new document indexed | no new document; the old row stays superseded |
| same section text in the 2024 and May 2025 manuals | both rows returned | May 2025 row kept |
| two May 2025 copies, same section, same score | both kept by the sync | retrieval keeps the lower document id |
| preview | writes nothing | writes nothing |

## Round 1 scope — old against new — 24 Oct 2026

Local harness only. In-memory recorder for `chat_form_state` and
`chat_traces`. No production query, no migration applied, model not called.
`SELF_CHECK_ENABLED` unset. Each other flag below is off in OLD and on in
NEW. The policy matcher is not behind a flag, so both columns agree. The
Colene location mapping file is removed. Grand Forks, Fargo, Raymore, and
Empire, SD are not mapped. No location row is written.

One run of `src/lib/ai/round1-scoreboard.test.ts`. It measures this table
once.

| Case | OLD | NEW |
| --- | --- | --- |
| Name: Christiana Headley, job title tanning consultant | christiana headley. Job title slot empty. | christiana headley. Job title Tanning Consultant. |
| Jane Store | Jane | Jane Store |
| Job title, as a candidate | Job title | not a name |
| SoC, insubordination | outside the top 14 (rank 15) | Standards of Conduct first |
| Dress Code, slippers | outside the top 14 (rank 17) | Dress Code for The Company first |
| Attendance, tardy | outside the top 14 (rank 16) | Attendance first |
| Late Opening, store opened late | outside the top 14 (rank 18) | Late Opening first |
| Policy matcher, opening the store late | Late Opening | Late Opening |
| Policy matcher, employee tardy | Attendance | Attendance |
| chat_form_state | 0 writes | 1 upsert |
| chat_traces | 0 writes | 1 insert |
| Cross-chat draft, same employee, template, date | creates | reuses draft-other-chat |
| Cross-chat, different date | creates | creates |
| Previous coaching, finalized plus a draft | draft stays in the on-file list | Not on file. These drafts are not previous coaching: |
| Store ask, global district manager | not asked | asked once |
| Store ask, already asked | not asked | not asked again |
| Store ask, admin | not asked | not asked |
| Sync guard, 2024 manual beside May 2025 | flag off, pending ingest | pending none, older_edition |
| Identical section text | both copies | newest edition only (ce6b00f1) |
| Preview | returns before the edition hold | returns before the edition hold |

## Round 1 item 9 — prompt caching — 24 Oct 2026

Local harness only. The model is not called. No production query. The
stand-in client in `src/lib/ai/prompt-cache-replay.test.ts` returns usage
from the blocks `callClaude` actually sent, at one token per four
characters. It waits that long before resolving, which is the first-token
time: the whole prompt when nothing is cached, and only the tail on a
cache read. One run.

The reorder and the `---DYNAMIC---` marker are emitted only when
`PROMPT_CACHE_ENABLED` is on. Off, the prompt is the base string: the
listener stays on the first line, and the marker is absent. On, the static
block is the instruction body, through the voice rules. It has no listener
name, no today's date, no location name, and no answer-mode sentence.
Per-request sections — the user, store, date, answer mode, open form,
reports guide, retrieved chunks, name matches, taxonomy, report figures,
forms on file, and person memory — follow the marker. The marker is not
sent. `cache_control` is `{ type: "ephemeral" }` on the static block only.
`callClaudeTool` sends a plain system string and is not cached. The tail
has no breakpoint.

A repeated prompt is what produces a cache read. A different user, store,
message, answer mode, or retrieval does not change that prefix.

| Call | cache_creation_input_tokens | cache_read_input_tokens | First token |
| --- | --- | --- | --- |
| OLD, one string, no cache | 0 | 0 | 55 ms |
| NEW, 1st call | 1603 | 0 | 55 ms |
| NEW, later calls | 0 | 1603 | 14 ms |

The static prefix was 1482 stand-in tokens until the retrieved-sources
rule (conv_mvnljjl32xlit48: retrieved sources are never something the
manager shared) joined the static rules; it is 1603 since.

Card replay pass/fail is unchanged. The form card does not read this
prompt, and the round 1 table above keeps the same expectations.

## One run — pass or fail — 24 Oct 2026

Commit `e1a6fdb`. Local harness. The model is not called. Each case once.
No production query.

Card cases use `proposeFormForTurn`. OLD is every flag off. NEW is
`TYPED_NAME_ENABLED`, `ACTION_PLAN_SENTENCES_ENABLED`,
`PRINTED_PAGE_ONLY_ENABLED`, `POLICY_CITATION_ENABLED`,
`PAYROLL_DEDUCT_AMOUNT_ENABLED`, and `ANTI_LOOP_ENABLED`.
`SELF_CHECK_ENABLED` is unset.

| Case | OLD | NEW |
| --- | --- | --- |
| b9 Test Employee, written CA | FAIL | PASS |
| b10 Testy Testerson, Dodge, measuring | FAIL | PASS |
| b11 Testy Testerson, late, Attendance | FAIL | PASS |
| b12 Sadie Hoffart, Empire SD | FAIL | PASS |

Same six flags on. OLD is the last-known-good prompt text (`655a61d`).
NEW is the current prompt, with the listener line after `---DYNAMIC---`.
The card does not read the system prompt, so the cache split does not
change these results.

| Case | OLD prompt | NEW prompt |
| --- | --- | --- |
| b9 Test Employee, written CA | PASS | PASS |
| b10 Testy Testerson, Dodge, measuring | PASS | PASS |
| b11 Testy Testerson, late, Attendance | PASS | PASS |
| b12 Sadie Hoffart, Empire SD | PASS | PASS |

Round 1 scope, one measurement of the table above. PASS means that run
matched the expected cell. Each row matched.

| Case | OLD | NEW |
| --- | --- | --- |
| Name: Christiana Headley, job title tanning consultant | PASS | PASS |
| Jane Store | PASS | PASS |
| Job title, as a candidate | PASS | PASS |
| SoC, insubordination | PASS | PASS |
| Dress Code, slippers | PASS | PASS |
| Attendance, tardy | PASS | PASS |
| Late Opening, store opened late | PASS | PASS |
| Policy matcher, opening the store late | PASS | PASS |
| Policy matcher, employee tardy | PASS | PASS |
| chat_form_state | PASS | PASS |
| chat_traces | PASS | PASS |
| Cross-chat draft, same employee, template, date | PASS | PASS |
| Cross-chat, different date | PASS | PASS |
| Previous coaching, finalized plus a draft | PASS | PASS |
| Store ask, global district manager | PASS | PASS |
| Store ask, already asked | PASS | PASS |
| Store ask, admin | PASS | PASS |
| Sync guard, 2024 manual beside May 2025 | PASS | PASS |
| Identical section text | PASS | PASS |
| Preview | PASS | PASS |

Prompt cache, one run of the local stand-in. Tokens are one per four
characters of the block that was sent. First-token time is how long that
stand-in waits.

| Call | cache_creation_input_tokens | cache_read_input_tokens | First token |
| --- | --- | --- | --- |
| OLD | 0 | 0 | 55 ms |
| NEW, 1st call | 1603 | 0 | 55 ms |
| NEW, later call | 0 | 1603 | 14 ms |

The rows above, and the matching rows in the item 9 section, are a local
stand-in: one token per four characters of the block that was sent. They
are not Anthropic usage, and they are not what `chat_traces` stores.
`chat_traces` stores `usage.cache_creation_input_tokens` and
`usage.cache_read_input_tokens` from the response. The static prefix in
this stand-in is 1603 tokens. A cache read of that prefix waits 14 ms in
the stand-in, against 55 ms with nothing cached. These stand-in counts
are mocked (`Math.ceil(characters / 4)`). They are not a measured
Anthropic bill.

## Live Claude cache — not measured

This checkout has no `ANTHROPIC_API_KEY`. No Claude call was made, so there
is no real `cache_creation_input_tokens`, `cache_read_input_tokens`, or
first-token time to record. The live check is manual: `npm run prompt-cache:live`
on a machine that has the key. CI and previews do not set `PROMPT_CACHE_LIVE`.
When it runs, it warms the cache once, then measures three calls. The first
measured call is included. It streams each opening turn of b9, b10, b11, and
b12 (`claude-sonnet-5`, adaptive thinking, the same effort as `callClaude`).

`callClaude` streams only when `CHAT_TRACE_ENABLED` or
`PROMPT_CACHE_ENABLED` is on and the client provides `messages.stream`.
The trace stores that wait on `first_token_ms`. With both flags off the
call uses `messages.create` even if `stream` exists, and `first_token_ms`
stays null. `chat_traces.latency_ms` is still the full reply. The cache
token columns are the response usage fields, not a character estimate.

## Store ask replay — 24 Oct 2026

`GLOBAL_STORE_ASK_ENABLED` on for the NEW column, off for OLD. Local
harness. The model is not called. A resolved store is carried onto the
next turn. The nickname is a test index (`the island` → store 236), not a
production nickname.

| Case | OLD | NEW |
| --- | --- | --- |
| Same message, Kearney | loc-66, no store question, card ready | loc-66, no store question, card ready |
| Earlier turn, Kearney | loc-66 kept, no store question | loc-66 kept, no store question |
| Nickname, the island | loc-236 Grand Island, no store question | loc-236 Grand Island, no store question |
| Typo, Kearny | "is that the store?", location empty | loc-66 Kearney, no store question, card ready |
| No store named | covers every store, card ready | asked once, create sentence kept, card ready |
| Ask ignored, or a different answer | not asked (flag off) | asked once across the conversation, card stays ready |
| Draft without a store answer | not asked (flag off) | card ready, draft created, location empty |
| Store given after the ask | not asked (flag off) | loc-66 kept, not asked again |
