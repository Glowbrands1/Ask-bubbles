# Parity log: Ask Sunny ↔ Ask Bubbles

This app is a port of Ask Sunny (`Glowbrands1/ask-sunny`); see
`docs/chat-parity.md`. Every fix to chat, forms, Corrective Action, policy
citation, access or sync is either ported to the sibling or listed here as
staying one-sided, with the reason.
See `CLAUDE.md`.

## 25 Oct 2026: a follow-up that names its own documents is searched on them — ported from Ask Sunny (a47bf19)

`FOLLOWUP_NEW_TOPIC_RETRIEVAL_ENABLED` defaults off, same name in both apps.
Found in Ask Sunny (QA Round 17, conv_mvo0ayai2x20aiy): a follow-up naming
new documents was searched on the earlier turn's subject. This app's
`rewriteRetrievalQuery` also reads the earlier turn and can do the same. On,
after the rewrite, a turn that names two or more words no earlier manager
turn used keeps the rewritten query only when it still has one of them;
otherwise the turn is searched as typed. The test is a neutral store/HR
case ("The I-9 and W-4 forms, direct deposit agreements"; the rewrite stubbed
with this manual's Employment Verification heading): none of the sibling's
documents or wording were copied.

## 25 Oct 2026: the framework's sections are not pinned into governed drafts — Bubbles-only

`FRAMEWORK_UNPIN_ENABLED` defaults off. The uploaded Performance Management
Framework (`ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT`) was
prepared from the sibling app's framework with only the app name changed,
so it still carries the sibling company's name, examples and metrics, and
the draft route pinned up to sixteen of its sections into every governed
form's prompt (Follow-Up Coaching, Corrective Action, Policy Review, EPPs).
On, a governed draft does not read the framework, its absence no longer
withholds the draft, and the app's own escalation rules stay in the system
prompt. Off, nothing changes. Test: `src/app/api/forms/pm-draft-route.test.ts`
("FRAMEWORK_UNPIN_ENABLED"). **Sibling app: not needed** — Ask Sunny's
framework is its own company's text; a matching note is in its parity log.

## 25 Oct 2026: the job title is a title the manager stated — ported from Ask Sunny (PR 188)

Ask Sunny PR 188 (`59fe1ca`, the same patch as `517992a`) is the title rule
under `MANAGER_WORDS_ONLY_ENABLED`; its mechanism (`title-words.ts`) reached
this app in the entry below (PR 116). `src/lib/ai/title-rule-oct24.test.ts`
runs QA's four turns, with this app's stores and titles, through every reader
that fills the Job title here: form-full-remap, the intent read and grounded
entities, flag on and off. On main, 8 of its 13 cases fail; on top of PR 116
all pass. No Sun Tan City content.

## 24 Oct 2026: the app's own lines are not the manager's words — ported from Ask Sunny

`MANAGER_WORDS_ONLY_ENABLED` is new and stays off. With it on, form-full-remap
reads the manager's turns without the lines the app writes onto the question
("The employee is …. Job title: …. It happened at Kearney, NE."), for the
fields and for the extraction call. The job title skips a pasted policy
("Managers or District Managers will be responsible …"), reads "ass't store
manager" as Assistant Manager, and drops a labelled phrase that is a clause
("test was late opening store"). What happened skips "Her name is …" and
"… works at Grand Island". The intent read takes the title from the manager's
turns only (most specific catalog title first), and grounded entities do not
read a pasted policy for it.

Same expected card as Ask Sunny; this app's path differs (remap is live here).
Tests use this app's production turn (conv_mvmz8pys26bs2ax) and the Ask Sunny
managers' turns with this app's stores and titles. No Sun Tan City content.

## 25 Oct 2026: exit text without tanning; three interview forms hidden

QA found Sun Tan City wording in what a Buff City Soap manager reads: the
exit form's Steps to Finish Termination ("verify tanning has been
removed") and the FTTC EPP's chooser description ("full-time Tanning
Consultant"). Pau confirmed Buff City Soap uses MyGlow and Sunlync, so those
steps and mentions keep the source wording; only the tanning clause goes
(exit form revision 4). The system names are read from one place,
`src/config/company/forms/exit-systems.ts`. The Details guard keeps MyGlow
and Sunlync and adds an entry for a claim, in any words, that the employee
was taken off a system or that anybody commented on an account. The Tanning
Consultant Interview and both management interviews, already withheld from
the chooser, are left out of `listTemplateSummaries()` and refused by the
create route (`config/company/forms/hidden.ts`); their rows are not touched.

**Sibling app: not needed.** The tanning clause and the three interviews are
Ask Sunny's own and correct there. No Ask Sunny change.

## 24 Oct 2026: a policy quote is not the manager's payroll answer

`INTENT_PAYROLL_MANAGER_ONLY_ENABLED` is new and stays off. With it on,
the intent read takes the payroll amount and the Yes/No from the manager's
turns only. In conv_mvmf4x1i2qxha7u the manager said "verbal, no payroll",
but the saved state had payroll amount 25 and Yes. The $25 came from the
assistant quoting the Late Opening policy. "no payroll" now saves No with
no amount, and a figure the manager typed is still kept.

**Sibling app: ported in the same session.** Ask Sunny's `intent-slots.ts`
has the same `mergeSlots` rule; the mechanism is ported there under the same
flag name. No store names or policy wording were copied.

## 24 Oct 2026: a manual citation only marks a page the sentence restates

`FULL_MANUAL_CONTEXT_ENABLED` stays off. On, `citePolicyAnswer` reads the
answer one sentence or bullet line at a time. Every `[p.N]` is taken off
and written again only for the page whose text that sentence restates. A
page the model chose stays when that page's text still matches. Nothing
else in the answer changes: no word, line break or bullet. On f8759f6 the
model's +1 pages stayed, and pages 10, 18, 20 and 29 were added to one
sentence because they shared a few words. Each of those pages also became a
Sources row. The manual block's page mapping is unchanged. With the
production rows it already marks Hair 15, Facial Hair to Buff City Soap
16, chunk 50 and Sun Tan City 17, Cell Phone and Company Email 19, and POS
Passwords 20 (checked against the manual's contents page and footers).
Tests read the whole production manual (151 rows) and the four saved replies.

**Sibling app: not ported in this change.** Ask Sunny's full-manual citation
is being reworked in Glowbrands1/ask-sunny#172 (open). That PR is checked
against Sunny's own saved replies separately. No Buff City Soap wording was
copied.

## 24 Oct 2026: a later form turn keeps what was already said

`FORM_FULL_REMAP_ENABLED` stays off. On, each turn reads every user message
in this conversation only, then merges that read with the slots already
saved for the same conversation id. A later value replaces a field. A blank
read does not erase one, so a date read on the first turn is not asked
again. A discipline word (`verbal`, `written`, a warning) selects the Corrective
Action Form when the manager did not name a form. "Create a Coaching Form"
stays the Coaching Form. "CA" is the Corrective Action Form. A bare "10-20"
is 20 October, not a time. "prior = manual ack 9/01" is the prior action,
not the form date. "at Grand Island out of dress code" names that store
when there is no comma before "out". A turn that only names the form
("Create a Coaching Form") is not the incident. The card shows the date, time, type of
warning, prior action, payroll answer, and what happened, which are the
template fields those words map to. A message id stored on another
conversation is left out, so that chat's store cannot fill this one.

**Sibling app: not ported.** Ask Sunny was not in this session. The
mechanism is the same one-call extraction; no store names were copied.

## 24 Oct 2026: printed pages on the full-manual answer

`FULL_MANUAL_CONTEXT_ENABLED` stays off by default. On, each page in the
cached manual is marked with the number printed on the sheet (the footer
`16 | P a g e`), not the PDF sheet index. Printed pages 3–6 are the JBA
table of contents and are left out, and any chunk that is a contents page
is left out, so a re-upload cannot put those sheets back into the prompt.

After the answer, each section the answer uses becomes a Sources row with
that printed page. An `[S#]` that is not one of the sources shown is
removed. A page the loaded manual does not contain is removed. An answer
that still cites no printed page uses ordinary retrieval, the same path
as the flag off.

The dress-code chat cites printed pages 15 and 16. Page 17 stays valid for
Sun Tan City's dress code and for other brands' pants. Crunch shirts and
pants are printed page 16, so a Crunch Shirts or Pants source on page 17
is dropped in favor of the longer phrase on page 16. A page outside 15–17
is not a citation for that answer. An inline label such as
"Tattoos, JBA Policy Manual p.16" does not replace the sentence in front
of it.

**Sibling app: not ported.** Ask Sunny's `main` does not have
`FULL_MANUAL_CONTEXT_ENABLED` (checked 24 Oct 2026). Sunny's open citation
work is on another branch and was not copied here. No Buff City Soap
policy text is copied there.

## 24 Oct 2026: one extraction fills the form

`FORM_FULL_REMAP_ENABLED` defaults off. On, each form turn is one tool
call over the whole conversation. A field is kept only when the manager
said it. A later edit replaces that field and the form continues. A blank
required field is one short question, and that question is not asked
again. Incident text is a short summary. "as you said" is only on a fact
the manager stated. A typed name stays as typed, with "Woven has …" when
one roster name is close. The call's model, token counts, and slots are
written on `chat_traces`.

The payroll amount from PR 80 stays: a stated deduction amount is the
amount, "$25.00 via payroll deduction" from the manual is not, and the
action plan does not repeat the figure. Yes with no amount is asked once.

**Sibling app: not ported.** Ask Sunny's form tool is the same one-call
shape (`record_form_turn`). It does not have `FORM_FULL_REMAP` yet, and
that repo was not in this session. No salon wording was copied.

## 24 Oct 2026: the whole current manual in a cached prompt

`FULL_MANUAL_CONTEXT_ENABLED` defaults off. On, a policy question puts the
current JBA Policy Manual in a cached system block: indexed chunks in
`chunk_index` order, printed pages as `[p.N]`, headings from the chunk text.
Retired and superseded documents are left out. The block stays under 120k
tokens (about four characters a token). Over that, the turn uses ordinary
retrieval. Cache read and cache creation tokens are logged on the model call.

An unbranded question, including "what's the dress code?", includes every
brand in that manual. Buff City Soap and Crunch are both in the block. A
question that names one brand gets that brand's manual plus the company-wide
sections. After the answer, a page or heading that is not on that page is
corrected when the heading has one page, or removed. An `[S#]` that is not
one of the sources shown is removed, so `[S11]` cannot sit beside eight
sources and `[S10]` or `[S8]` cannot sit beside seven.

Ask Sunny's `main` does not have this flag yet (checked 24 Oct 2026). The
mechanism is the one both apps should share. This change is not ported in
this session, and no Buff City Soap policy text is copied into Ask Sunny.

## 24 Oct 2026: the newest Woven edition is the one that answers

Ported from Ask Sunny branch `cursor/edition-supersession-6d4a`, commit
`84d4f7f` (branch tip `89093ce` also pins an unrelated analytics test; that
pin is not in this change). Mechanism only. No salon name was copied. The
JBA Policy Manual titles stay, because both apps cite that manual.

When `EDITION_SUPERSESSION_ENABLED` is on and Woven publishes a revised
document, the sync marks the older edition `status = superseded`,
`indexed = false`, and `superseded_by` the newest document. The row, its
chunks, and its file stay. A later sync does not ingest that older edition
again while a newer one in the same family is current, even if the older
file's updated time or bytes change. The family is the title and file name
with the edition date and words such as edited, master, and acknowledgement
removed. The date is the month and year in that name, or Woven's updated
time when the name has none. Two editions from the same month and year both
stay indexed. A year with no month is not older than a month in that year.

Retrieval then keeps one copy of a section whose normalized text is the
same, so the citation does not flip between them. That is the content
identity. Hand uploads still use the existing content-hash and file-name
match in `supersession.ts`. Off, sync and retrieval are unchanged. Preview
still writes nothing. No new migration. No rows are deleted. Hybrid search
applies the same section dedupe after its own ranking, and only when this
flag is on. Hybrid itself stays off.

Search already requires `indexed = true` and `status = 'indexed'`
(`match_knowledge_chunks`, `match_knowledge_chunks_hybrid`,
`match_knowledge_sections_fuzzy`). A superseded row cannot be indexed, so
its chunks are not candidates.

Sibling app: this is the port. Ask Sunny already has the guard on
`cursor/edition-supersession-6d4a`.

The re-activation guard is Bubbles-only in this change. When
`EDITION_SUPERSESSION_ENABLED` is on, a sync does not re-index a
`knowledge_documents` row that is already `status = superseded`. The match
is the Woven record's document id, or the content hash of a superseded row
(the document's `content_hash`, and the file hash already stored on the
sync item). A re-sent record stays off even if its bytes change. A re-filed
copy under a new record stays off. The row keeps `indexed = false`,
`superseded_by`, and `superseded_at`. No new column and no screen change.
Off, a re-ingest still clears those columns and indexes the row, which is
the path Sunny's pipeline still takes. Ask Sunny is not updated here.

## 22 Oct 2026: both apps brought level (pending QA review)

Every chat/forms fix merged to either `main` from 12–21 Oct was compared. The
gaps below are closed on branch `claude/lucid-shannon-v79zju` in each repo,
**not yet merged to `main`** (QA hold, 22 Oct). Everything else already
existed in both.

### Ported into Ask Sunny from Ask Bubbles (sibling)

| Bubbles commit | Fix |
|---|---|
| c32eb59 (+ Sunny's own unmerged 0090bef) | The open conversation stays in the address; a reload reopens it |
| fe871f1 | Confirm before deleting a conversation or finalizing a form |
| ab77b14 (+ Reviews/Videos from Sunny's unmerged c2a0e88) | Small links and buttons at least 24px to tap |
| 062e5dc | Browser autofill off on every typed form field |
| 987e4b7 | "Create a form" shown only to an account that may create one |
| 4cbb84c | "write a CA for X" read as a request; the CA leads when asked for |
| 8cdc41b | What an earlier coaching was for stays on the history line |
| ac36870 | HR's 21 Oct wordings: payroll answers, a friend/coworker in the account is not the employee |
| b1047ab | One employee's short answers never land on another's form |
| 9530112 | "verbal, payroll deduct no." read as the level and the payroll answer |
| c25e05c | Possessives, all-caps/lower-case names (capitalised on the card), punctuated salons, Google store codes — cherry-picked from Sunny's own unmerged c52d74c, d616cf4, fa565c0 |
| 8e3e81e | Intake stays open on a salon / "I already told you"; "my employee <name>"; CA offered beside Coaching after a repeat |
| 51e1d5e | Exact title match when a knowledge upload supersedes a document; `/api/health` no longer 500s in demo mode |
| 54b3d42, 6e92b9d | Template sync lists every failure; an interrupted publish is finished, never reported as success |

Sunny gained an end-to-end regression suite for HR's 21 Oct conversations
(`src/app/api/forms/hr-feedback-oct21-e2e.test.ts`).

### Ported into Ask Bubbles (this app) from Ask Sunny

| Sunny commit | Fix |
|---|---|
| cf1480b | After a Save the card reloads its form; a refused finalize opens the policy dialog instead of a dead-end error |
| 4c15744, b78a497, 5ffa19e | Policy notices say "Woven does not see this policy in the knowledge base" |
| 1d63aeb | A Corrective Action lists the employee's forms already on file as prior actions |
| 7b3edea | Timeout headroom for two slow test suites |

### Staying one-sided (by design)

- Sunny only: EFTs (5b7686a), KS Manhattan district move, Google reviews
  posted-date anchors (76b2b85 — Bubbles already counts by Google's own create
  time).
- Bubbles only: Buff City Soap content, Store/Guest terminology, Forms Register
  name, sidebar order, Bubbles' account provisioning, `entity-facts.ts`
  (efde160), the store resolver and Woven title verification (ffea279), the
  report ask bar's form list (b87431c — Sunny lacks the feature).
- Bubbles only: `revocation.local-stack.test.ts` proves a session is alive
  through Ask Bubbles' API instead of a direct knowledge read, because
  Bubbles' knowledge tables are server-only (`20261003001000`). Sunny's
  knowledge policy differs and its revocation test already passes (QA, 22 Oct
  2026).
- Woven-affiliation designation (Bubbles 6d388ad) is not needed: both apps now
  show a manager the forms at every location Woven assigns them.

### Open decisions (not ported yet)

1. Sunny: admins who aren't company-wide limited to granting their own areas (Bubbles 2123821).
2. Sunny: asking "which date goes on the form?" when two incident dates are given (Bubbles 9c02dcb).
3. Sunny: every form, not only CAs, built only from the turns about that form and person (Bubbles a73ef6c).
4. Sunny: two forms from one message, and "which one?" for a correction (Bubbles 01fa914, 8b79a46).
5. Sunny: Bubbles' store resolver / Woven title verification / chat-side people lookup (ffea279, efde160).
6. A same-origin guard on Sunny's Apify review-sync admin routes.

## 22 Oct 2026: from Ask Sunny — CA recipient, and no real people in the repository

- **Ported** Sunny 6b5f897 (PR #127): "CA for <name>" is the recipient; the
  incident's other names are not candidates.
- **Ported** Sunny PR #130: tests, comments, docs and migration notes use
  synthetic people only (both companies' real names and work addresses
  removed); `src/lib/security/no-real-people.test.ts` guards company
  addresses. Bubbles has no copy of the policy-manual fixture, so that part
  of Sunny's change does not apply.

## 22 Oct 2026: Corrective Action QA audit (Ask-bubbles#68 → ask-sunny#128)

Every fix in this audit is ported to Ask Sunny in Glowbrands1/ask-sunny#128,
one `Port from Ask Bubbles (<sha>)` commit per fix: the invented-date guard
in drafted text, the draft notice on the chat card, payroll amounts without
`$` and "$0" as No, a cancelled order beside the deduction not read as a
waiver (7add5b2), the register `form_date` kept in step with the Date line,
the two-policy question ("Cell Phone/Smart Watch or Social Media?"),
autofill off on typed form fields, and the audit's manual fixture with
invented wording (400bab2). Ask Sunny keeps its own payroll rule (a Yes is
read only when stated) and sets the warning level on the form.

## 23 Oct 2026: chat-quality flags, ported from Ask Sunny PR #135

Ported from Ask Sunny PR #135 (`ab58ac2`). Bubbles adaptations, so the
mechanism is shared and the company content is not:

- Store, not salon. Forms Register, not Form Monitoring. The JBA Policy
  Manual stays the citation source (policy name and page). `JBA Manual` is
  that source, never an employee.
- No company glossary. A section is chosen by the same Corrective Action
  readers the sibling uses (`accountManualSections`): the manual's own
  headings and the chunk's page. An employee who is tardy cites Attendance.
  A store opening late cites Late Opening. Phone use cites Cell
  Phone/Smart Watch. The flagged citation is `Attendance Policy, JBA Policy
  Manual p.14`.
- The JBA Policy Manual is the approved source (Pau, 23 Oct 2026). A
  fallback match of that title is not asked for owner confirmation. A
  different manual still is.
- Incident dedupe is keyed on the incident. The card-id match Pau already
  fixed is unchanged. After a card miss, the fingerprint table runs, then
  the draft's own narrative, and only when `DRAFT_DEDUPE_ENABLED` is on.
- Conversation form state shares the chat form-state table (`state` jsonb
  beside the existing `fields` jsonb). Memory kinds are store, employee,
  and preference. Store notes stay visible; employee and preference notes
  stay in the conversation that stored them.
- `GROUNDED_ENTITIES_ENABLED` and `FORM_STATE_ENABLED` match the sibling's
  names and default off. `DRAFT_MERGE_ENABLED` is the same switch as
  `DRAFT_EDIT_MERGE_ENABLED`. Title and primary location come from this
  app's Woven directory (`loc-*`), not from another company's location tables.
- The Google Reviews sentence is the sum of the stored store totals
  (`apiTotalReviewCount` when present, otherwise `reviewCount`) and says
  "stores". This app has no weekly qualifying snapshot.
- When `ACTION_PLAN_SENTENCES_ENABLED` is on, the plan is the review
  sentence and the required closing. The existing builder is unchanged
  when the flag is off, including its payroll sentence.
- The chat screen imports the store resolver, which imports the name
  matcher. That matcher does not import `node:async_hooks` (the browser
  bundle cannot). Kept names for one server request live in
  `kept-typed-names.ts`. The sibling's matcher on
  `cursor/hybrid-search-timeout-595e` still imports `AsyncLocalStorage`
  from `node:async_hooks`. That repo is not in this session, so the split
  is not ported there yet.

### Intentional differences

- Store, Forms Register, Buff City Soap stores, the Woven roster, and this
  app's Supabase tables. No other company's location names or glossary.
- Policy selection follows the manual readers. It does not add a model call
  that picks a heading, and it does not keep a heading-overlap preference.
- The Google Reviews total is the stored inventory, worded for stores.
- Card-id dedupe stays first. The fingerprint table stays beside the
  narrative match.

## 23 Oct 2026: intent extraction, ported from Ask Sunny `cursor/intent-extraction-6d4a`

`INTENT_EXTRACTION_ENABLED` defaults off. One Haiku tool call copies the
employee, store, title, incident, date, payroll amount, warning level, and
form. A slot is kept only when this app's Woven roster, `COMPANY_LOCATIONS`,
or the retrieved JBA headings agree. A missing or ambiguous slot is the only
question, and an ambiguous one is a numbered choice with the store and the
title. No migration: the slots share the existing `chat_form_state.state`
jsonb (`incidentType` and `payrollAmount` added to that object). The tool
payload is parsed by hand. Store wording, `loc-*` ids, and
`ACTIVE_BRAND.knowledgeScopeId` are this app's.

## 23 Oct 2026: feedback replay cases and few-shot examples

`FEWSHOT_EXAMPLES_ENABLED` defaults off. Ratings of 1–4 become redacted
replay cases (`scripts/feedback-to-eval.mjs` reads a JSON join on stdin and
writes cases to stdout; it does not connect to Supabase). A 5-star row can
add a similar redacted question to the prompt, joined from `chat_traces`
on `client_message_id` when a trace exists. `assistant_feedback` still
stores no question and no answer, and no column was added. No migration.
Store names come from the caller (`COMPANY_LOCATIONS` at request time).

## 23 Oct 2026: self-check and manual-term retrieval

`SELF_CHECK_ENABLED` defaults off. After an answer, a JBA citation must be
a heading and page in the chunks that turn retrieved, and an action plan
must be two sentences when the answer has one. A name the answer already
uses is kept when Woven does not list it. A repair that drops that name,
or that says the person is missing from Woven, is not shown. One repair
call if a citation or a plan check fails; a repair that still fails leaves
the original answer. The flag off does not call the model.

Ask Sunny `main` (`b9ae362`) still adds "I couldn't find **name** in the
Woven roster" when the roster check fails, and its repair may set the
card to `needs_employee`. That sentence is not ported. The typed name stays.

`QUERY_REWRITE_ENABLED` already defaulted off. On, a short follow-up is
still anchored to the earlier turn, and the retrieval query is then
rewritten into manual terms from the conversation. SKIP, an empty rewrite,
or a model failure keeps the typed question. The answering model still
sees the question as typed. No glossary and no migration.

## 24 Oct 2026: typed names, late opening, two-sentence plans, citations

**Sibling app: not ported.** Ask Sunny `main` at `b9ae362` still asks
"Did you mean" and "Who is this for?" for a name Woven does not list, and
its corrective-action plan still inserts a payroll sentence between the
review and the closing. Port the mechanism. Do not copy store names,
people, or Buff City Soap wording.

`TYPED_NAME_ENABLED` defaults off. On, a name the manager typed is kept,
including one Woven does not list. A state code from `COMPANY_LOCATIONS`
and a span of the JBA manual title are not people, so a turn that names
someone at Dodge, NE and cites the JBA Manual is not asked which of those
is the employee. The system prompt does not tell the model to ask for the
full name again, and a job title the manager typed is not replaced by
Woven's title. Off, the previous ask stays.

A store that opened late is the Late Opening offense (`late_opening`), not
Tardiness. An employee who arrived late stays Tardiness, which cites
Attendance. A missed policy acknowledgement is Standards of Conduct.
Leggings are Dress Code. "Opening tasks" and slippers are unchanged.

`ACTION_PLAN_SENTENCES_ENABLED` already defaulted off. On, payroll deduct
Yes does not add a third sentence, and a "$25.00" the Late Opening
section quotes is not filled into the action plan unless the manager
stated an amount. The amount line itself is the next section.

`POLICY_CITATION_ENABLED` already defaulted off. On, a form that has a
policy line gets the manual section name and printed page from the chunk.
A chunk with no page is not given one. The prompt says the same, and only
when the flag is on.

`PRINTED_PAGE_ONLY_ENABLED` defaults off. On, self-check and the retrieval
row passed into that check use the printed page only. The PDF sheet
number is not treated as the printed page. Off, either number still passes.

On `TYPED_NAME_ENABLED`, one close roster match is the note "Woven has
Jane Doe" under the card. The card in that same turn uses the typed
name. The note is not a question and does not block the card. A name
Woven does not list has no note. Two different close matches are still
a question. A job title the manager typed is the title on the form,
including where Woven verified a different one. "based", a state code
from `COMPANY_LOCATIONS`, and a span that uses a word of the JBA manual
title ("workplace policy", "JBA Manual") are not a person and not a
store. Off, "Did you mean" and the Woven title still win. Ask Sunny
`main` at `b9ae362` still asks "Did you mean" for one close name; this
short under-card note is not ported.

## 24 Oct 2026: payroll deduction amount

**Sibling app: not ported.** Ask Sunny `main` at `b9ae362` has the Yes/No
question "Is payroll deduct applicable?" and reads a manager-stated amount
into the action-plan sentence. It has no separate amount field and no
"Payroll deduction amount" label. This line follows that Yes/No placement
(the next block, before Acknowledgement) and the same manager-amount
reader. Do not copy salon names or Sun Tan City wording.

`PAYROLL_DEDUCT_AMOUNT_ENABLED` defaults off. The Corrective Action seed
in `library.ts` includes **Payroll deduction amount** immediately after
the payroll Yes/No question. That seed is not published: the live Bubbles
template is still version 2 until Pau approves a publish. On, chat fills
the line only from an amount the manager stated, asks once when payroll
is Yes and the amount is missing, keeps that amount on `chat_form_state`
across a redraft, and does not put it in the action plan. A "$25.00"
quoted from Late Opening is not written into the line. Off, chat does
not ask and does not fill.

## 24 Oct 2026: name, store, and issue gate (replay b9–b12)

**Sibling app: not ported.** These turns are Buff City Soap's. Ask Sunny
`main` is not this working tree, and its people, salon names, and wording
stay there. The mechanism is the one `TYPED_NAME_ENABLED` already gates.
Nothing here is a prompt change.

On that flag, a state code is not a person, a surname "Employee" is kept,
and a comma after a job title does not hide the name. ", SD" is not read
as Store Director. "do verbal for" opens a corrective action and sets the
level. "show draft" continues the open card. An "at <place>, <state>"
that is not a registered store asks with the stores in that state and
does not invent the town. A for-clause that is only the title, the
person, and the place is not the issue; the offense sentence is. "cite
…" continues the open card. The two-sentence action plan is read back
on that card when `ACTION_PLAN_SENTENCES_ENABLED` is on. A later turn
that is only the same manual topic and a new date ("jba manual 11-1-25")
replaces that prior step's date and is not offered as the form's date.
Off, the for-clause, the article in "do a verbal", and the old store miss
stay as they were.

## 24 Oct 2026: anti-loop replay (name, store, confirm, page)

**Sibling app: not ported.** Ask Sunny `main` at `b9ae362` still asks
"Did you mean" and still asks which salon. These turns are Buff City
Soap's. Sunny's people, salon names, and wording stay there. `chat_traces`
is already applied in production; this change does not add a migration.

`ANTI_LOOP_ENABLED` defaults off. On, the model does not write the
employee: a name is read in code, store and promo words are stripped, and
a name Woven does not list is kept as typed. Slots already stored in
`chat_form_state` stay until the manager changes them. The store is not a
question: the account's single store, then the roster's single store,
otherwise blank and editable. There is no "Did you mean" and no confirm
loop. One close roster name is still the under-card note "Woven has Jane
Doe". A roster refusal is not shown, and a self-check repair is not
shown. A date on the card is ISO. A policy page comes from the heading's
printed page on the chunks in hand. Off, two close matches are still a
question, and an unmatched town in a state still asks with the stores in
that state.

The system prompt before `295d573` (`655a61d`) was scored against the
current prompt on the same code and the same flags. The card runner does
not read the system prompt. Neither arm scored better. The prompt
sections stay. Ask Sunny was not changed.

## 24 Oct 2026: Sunny prompt sections that chat and forms were missing

**Sibling app: ported here from Ask Sunny `main` `b9ae362`
(`src/lib/ai/prompts.ts`, 774 lines).** The mechanism only. No Sun Tan
City wording, salon names, or Sunny people. Ask Sunny was not changed.

On Bubbles `main` that file is 528 lines. The branch before this port
was 545, which is `main` plus the typed-name and printed-page sentences
from `295d573`. Those sentences are still in the file.

Ported, and only when an existing flag is on. With every new switch
omitted or false, `buildSystemPrompt` is the same string as before.

- `CHAT_STYLE_RULES_ENABLED`: Sunny's "BEFORE YOU SUGGEST ANY CONSEQUENCE"
  (EPP, opportunity volume, name the behaviour, lightest next step,
  recognition) and the no-employee-report figure rules. A name is not
  refused because it is missing from a report.
- Same flag, and only when a forms library block is attached: a process
  step (observation, role play, a follow-up review, escalation to
  leadership) is not a form, and coaching guidance is cited from the
  knowledge base while the blank template lives in Forms.
- `ACTION_PLAN_SENTENCES_ENABLED`: an action plan on a form is exactly
  two sentences. No payroll sentence and no third sentence. Sunny says
  this in its repair prompt; the system prompt now says it too.
- `PRINTED_PAGE_ONLY_ENABLED`: cite the printed page. A PDF sheet number
  is not that page.
- `TYPED_NAME_ENABLED`, when person memory or forms on file are attached:
  a possible match and a shared first name do not become a question, and
  a roster miss does not block. Off, those sections still ask.

Skipped, and why:

- `SUNNY_VOICE`. Brand personality. This app uses `ASSISTANT_VOICE`.
- Employee-facts block (`EMPLOYEE_FACTS_ATTACHED_RULES`,
  `EMPLOYEE_DATA_SECTION`). Nothing in this app renders that section.
  The "no dataset" half is the figure rule above.
- Daily stats source, reasoning, and the five-part manager answer
  (`DAILY_STATS_*`, `MANAGER_ANSWER_SHAPE`). Those name Sun Tan City
  report families (bed usage, spa, PPTA, tanning). This app has no
  daily-stats framework. The non-salon pieces (do not treat a number as
  a finding, name a behaviour, recognition) are in the consequence rules.
- Reports guide systems (OPS Dashboard, Power BI, Portal Report Center,
  Salon Director, tab filters, an "Ask about this report" bar). This
  app's guide is already built from its own report list and is omitted
  when that list is empty. The pages do not have those controls.
- The spa example in the missing-reports sentence. The generic sentence
  is already here.
- `policyManualNote`. `handbookNote` is that slot.
- Sunny's finalized-form line that sends the manager to Form Monitoring
  to open a revision. A finalized form here opens a new draft in the
  conversation.
- Sunny's repair line that an employee must be a roster name. That
  blocks on Woven. It is not in this prompt.
- The numbered "order of authority" and "examples are not facts".
  `PINNED_SOURCE_RULES` already says that for whatever document was
  pinned.
- Sunny's shorter facsimile-form rule. This prompt's list is the longer
  one and stays.

## 24 Oct 2026: a store word before a title is not the employee

`TYPED_NAME_ENABLED`. "create a coaching form for bellevue team member,
casey quinn, who was talking on her cell phone…" keeps casey quinn. The
city word is taken from this company's store names, and it is dropped only
when the turn also names a person. A city that is the only name in the
turn is still kept.

Ask Sunny reads salons in `salon-mention.ts`, not this store list. The
same sentence is not ported. No salon name was copied.

## 24 Oct 2026: name, date slot, and store (Round 1)

`TYPED_NAME_ENABLED` and `ANTI_LOOP_ENABLED`. A name written before a job
title is the employee. A person named only inside the account does not
replace them. "verbal ca was given on" and a coaching date in a list are
earlier steps. "use todays date" and a bare "today" with no incident date
are the form's date. On an exit form the card date is the last day worked,
then the notice. "store location is …" and "primary store is …" are the
store, and the reply does not ask which one.

Ask Sunny is not updated in this round. Its salon choice lives in
`salon-mention.ts`, and its exit form dates a different set of fields.
The shared name and date readers (`proposal.ts` `settle`, `form-date-answer.ts`)
still have the old behaviour there. Port those readers in Sunny's next
replay round. No Buff City store, title, or person was copied.

## 24 Oct 2026: a job title label is not the employee

`ANTI_LOOP_ENABLED`. Sunny's priority replay s8 and s17 forbid an employee
named "job title" and put the stated title on the role. Those turns are
here as Morgan Blake (exit, Team Member, Lee's Summit) and Riley Quinn
(performance CA, Team Member). The words after the label "job title" go
on the Job Title slot. "Job Title", "title", "position", "location",
"store", and "date" are not employee-name candidates.

Ask Sunny is not updated. Its s8 and s17 use a tanning title and salon
names, which stay there. The label strip is in this app's name step
(`settle` and `stripNonNameTokens`). No salon title was copied here.

The shared label list is `NAME_LABEL_WORDS` in `name-words.ts`: job,
title, position, role, location, salon, and store. A candidate is
rejected only when it is the label itself ("Job title"). A surname
such as Store or Salon stays: "Jane Store". A trailing "Job" or
"Title" comes off only after a full name. The words after "Name:" stay
the employee. Sunny's reader does not have that list yet. Port
`stripTrailingJobOrTitle` and `nameAfterNameLabel` in Sunny's next name
round. "Tanning consultant" was not added to this company's titles.

## 24 Oct 2026: validation port (retrieval, drafts, store ask)

Four flags, all default off. Ask Sunny is not updated in this round. The
validation measured both apps; these are the Bubbles mechanisms. No salon
name, tanning title, or Sunny location number was copied.

`CA_POLICY_RETRIEVAL_ENABLED`. A corrective-action question boosts the
current JBA Policy Manual over the Performance Framework. The synonym map
sends insubordination, acknowledgment, acknowledgements, "policy
acknowledgements", and refusal to Standards of Conduct; uniform, slippers,
and shoes to Dress Code for The Company; tardy to Attendance; "store opened
late" and opened late to Late Opening. The exact prompt "CA for
insubordination, she did not acknowledge policies at onboarding" keeps
Standards of Conduct outside the top 14 until the flag is on. Dress Code
moves from rank 17 to 1 on the slippers prompt; Standards of Conduct moves
from rank 15 to 1 on the insubordination prompt. The retriever fetches a
wider window only when the flag is on. Hybrid search stays off in the app.
The hybrid reorder is tested in the local harness only
(`src/lib/knowledge/ca-policy-hybrid.local.test.ts`), on an in-memory
candidate list, with no database call and no embedder.
`research/reports/full-validation-2026-10-24.md` was not in this checkout.
The 17 plain-language cases in `ca-policy-retrieval.test.ts` are the
stakeholder cues, the Sunny rewrite questions adapted from salon to store,
and those two phrases. The edition guard that keeps the newest Woven
copy is ported separately, behind `EDITION_SUPERSESSION_ENABLED` (see the
24 Oct section at the top of this log).

`CROSS_CHAT_DRAFT_DEDUPE_ENABLED`. An open draft for the same employee,
template, and incident date is reused across chats, including a draft
another manager started. The card-id match stays first. `DRAFT_DEDUPE_ENABLED`
is unchanged. A different date, or a request for a separate document, still
creates.

`PRIOR_RECORD_FINAL_ONLY_ENABLED`. "previous / prior / past" coaching, and
a question that asks for drafts, keeps finalized rows in the on-file list
and lists drafts in a separate section that says "Not on file. These drafts
are not previous coaching:". A draft is never described as previous coaching.
The flag off keeps the labelled draft list and does not add that section.

`GLOBAL_STORE_ASK_ENABLED`. A global-scope district manager is asked once
which store. The question is appended after the create sentence, so the
card stays ready and the draft is not blocked. Admin, owner, and developer
keep the existing copy. A store named in the same message, on an earlier
turn, or by a nickname passed into the store index is resolved and is not
asked again. One in-scope typo (Kearny → Kearney) is resolved only while
this flag is on; off, that typo is still "is that the store?" and the
location stays empty. The nickname "the island" is a test index, not a
Buff City nickname in `COMPANY_LOCATION_NICKNAMES`. Empire, SD is not a
store. A typo at the end of an earlier paragraph is still read after turns
are joined. A name that is not on the Woven roster stays the typed
string, and the store question still does not block the draft. Ask Sunny
is not updated for that reader, for the non-blocking ask, or for that
typed-name check.

Pau dropped the Colene location mapping prep. Grand Forks, Fargo, Raymore,
and Empire, SD are probably test data. The review migration is not in this
tree. No location row is written. No production data is written.

## 24 Oct 2026: prompt caching

The answering prompt is split. The instruction body is the cacheable
prefix. The listener's name, today's date, and their location follow
`---DYNAMIC---`. `PROMPT_CACHE_ENABLED` defaults off. On, `callClaude`
sends the prefix as a text block with `cache_control: { type: "ephemeral" }`
and the tail as a second block with no breakpoint. Off, that call sends
the previous single system string. The marker is not sent. No rule
sentence was rewritten.

Ask Sunny is not updated. Its `buildSystemPrompt` still opens with the
listener line, and its `call-claude` still sends `system` as one string.
There is no `---DYNAMIC---` cut on Sunny's `main` or on
`cursor/edition-supersession-6d4a`. Port the cut with Sunny's next
prompt round. No salon wording was copied.

## 24 Oct 2026: cache split, trace columns, flags-off suite

Per-user, employee, store, and retrieval sections now sit below
`---DYNAMIC---`. The static block is the same from one request to the next.
`chat_traces` gains nullable `cache_creation_input_tokens`,
`cache_read_input_tokens`, and `first_token_ms` in an additive migration
that is not applied here. A live indexed document that shares a superseded
document's content hash stays in search. `ANTI_LOOP_ENABLED` is in
`CHAT_QUALITY_FLAG_NAMES`, and a flags-off child suite covers chat and
forms. Ask Sunny has no `---DYNAMIC---` cut, so this round stays
Bubbles-only. No salon wording was copied. The answer-mode sentence
sits in the tail as well, so a different mode does not change the cached
prefix. The live Anthropic check is `npm run prompt-cache:live` and does
not run in CI or on a preview. `chat_traces` stores the response's
`cache_creation_input_tokens` and `cache_read_input_tokens`. The reorder
and the marker are emitted only when `PROMPT_CACHE_ENABLED` is on, so the
flag-off prompt stays the base string. Ask Sunny is not updated for that
gate. PR 91 is not merged here.

## 24 Oct 2026: chat data tools, measured, not ported

`CHAT_DATA_TOOLS_ENABLED` already defaults off in both apps. Ask Sunny's
reader is the salon snapshot (`chat-data-tools.test.ts` on `b9ae362`): a
model chooses reviews, sales, or the Comp Report, and the inventory line
says "salons". This app's reader is the stored store summaries, and the
line says "stores". The one-at-a-time card replay does not call that
reader. The effect recorded in `docs/scoreboard.md` is this app's block:
password-reset help, and Google Reviews only for a role with
`view_reports`. No Ask Sunny change. No Buff City store list was copied
there, and no salon list was copied here.

## 24 Oct 2026: stream only when a flag is on

The main answer call streams only when `CHAT_TRACE_ENABLED` or
`PROMPT_CACHE_ENABLED` is on. With both off it uses `messages.create`,
including when the live client has `messages.stream`. Ask Sunny is not
updated in this session. Its answer path is still a separate `call-claude`,
and this change stays on Ask Bubbles PR 90. No salon wording was copied.


## 24 Oct 2026: remap incident (prod, FORM_FULL_REMAP on)

What happened came from what was left of the request, "previous coaching: …"
was not a prior action, "10-1" was read out of "10-15-26", and a remap card
cited no policy. Fixed in `form-full-remap.ts` and the new `remap-incident.ts`
behind `REMAP_INCIDENT_FIX_ENABLED`; the date regex is an unflagged bug fix.
Ported to Ask Sunny's remap path in the same session. Sunny's live intent
path got its own fixes for the same cases (Sunny-only files; see Ask Sunny's
parity log). Tests: `src/lib/ai/remap-incident-oct24.test.ts` in both apps.

Follow-up (QA step 3 and C-list, 25 Oct 2026): What happened is read one
turn at a time, so an edit or command ("change the date to 10-22", "name is
…", "show draft", "cite …", "this is a violation under …") never replaces it;
a later create request with its own incident resets What happened and the
policy; a bare "Yes" after several questions answers none; the action plan
is the manager's own or blank; "as you said" on the store and title only
when a manager turn holds the words; "at Grand Island used her cell phone"
keeps the store. Same flag. Ported to Ask Sunny's remap path, and its intent
path got the same behaviour in its own readers.

## 24 Oct 2026: a policy phrase is not a typed store

`PLACE_SPAN_GUARD_ENABLED` (default off). In conv_mvmcetjw2i4vtwz, "cite
animals in the workplace policy" followed by "store location is empire, sd"
was joined into "in the workplace policy store", and the card asked about a
typed store called "workplace policy". On, the span reader skips a phrase
that names a policy, manual, section or similar document, and a
span-before-"store" match must sit inside one manager turn. Ported to
Ask Sunny (9b206c6, same flag): its roster salon reader
(`src/lib/forms/salon-mention.ts`) has no unmatched-span reading, but its
"<place>, <state>" reader (`place-state.ts`) joined the turns ("… in the
workplace policy" then "at Kearney, NE" read as one unknown place) and its
employment-change labelled location kept "per the new salon policy" as the
salon. Both are guarded there. No salon wording was copied.

## 24 Oct 2026: "location kearney" names the store (from Ask Sunny, QA Round 4)

Same flag, `PLACE_SPAN_GUARD_ENABLED`. Ask Sunny conv_mvmw4hwq292a6vq:
"name is test testyone, location st joe, …" after "salon is wornall" left
the card on Wornall (Ask Sunny 503d454). The same turns with stores here:
"location kearney" and "store kearney" were not read, and the form remap
and the intent slots kept Grand Island. On, `store-cue.ts` reads "location /
store <name>" as "at <name>" (the store reader's own rules still apply), and
the store the newest manager turn names wins on the remap and the intent
slots. No salon wording was copied. Test:
`src/lib/forms/store-label-cue.test.ts`.

## 25 Oct 2026: edits are applied or answered; dates follow the incident (port)

`FORM_EDIT_DATE_RULES_ENABLED` (default off), the sibling app's flag and
mechanism on this app's remap path. "change observation of offense to: …"
makes What happened that text; "add that she was also on her phone" appends
it and the reply says so (conv_mvnuh50i2hanl53); "clean up my grammar" and
"change the date to 10-23-26" (conv_mvnsowzl20ljr9m) never become What
happened; "X instead of Y" names X; a prior action's date ("jba manual
11-1-25", conv_mvnsqglc2v7zuyk) is never the Date; "late today" is today
(conv_mvnu46n823v1unt); "can you edit the form I already finalized" opens a
revision. Not ported: the Follow-up line rule (this card has none) and the
card salon edit (the store edit is its own fix here). No salon wording was
copied. Test: `src/app/api/chat/edits-dates-replay-e2e.test.ts`.

## 26 Oct 2026: the stored-slot lines are not a new request — ported from Ask Sunny (STORED_SLOTS_NOT_A_REQUEST_ENABLED)

`STORED_SLOTS_NOT_A_REQUEST_ENABLED` defaults off, same name in both apps; Pau
approved the form-proposal.ts edit for both apps on 26 Oct 2026. In the
sibling app the stored-slot lines put ahead of a slot answer made
`turnsAboutThisForm` start the form over at that turn, so its card was drafted
from the last turn alone. The same ~8 lines here: with the flag on, the
new-request check in `turnsAboutThisForm` reads `managerWords(...)`, not the
app's lines (detectTemplateIntent, statesHistoryOnly, readEmployeeMentions,
correctsTheEmployee, describesIncident, describesMoreThanTheRequest). This
app's live form path is that proposal path (FORM_FULL_REMAP off in
production). Replayed through POST /api/chat with this app's production list,
a Corrective Action, "yes", "$25" and Create draft already keep the incident
turn and the observation with the flag off; the live blank draft
(conv_mvp2eerf23op5u7) was not reproduced by this replay. Test:
`src/app/api/chat/stored-slots-not-a-request-e2e.test.ts`.

- 26 Oct 2026, POSITION_ANSWER_GUARD_ENABLED (Bubbles only): with the
  position (job title) question open, a warning-level or payroll answer
  ("verbal", "This is a verbal", "Payroll deduct is not applicable") was saved
  as the Job Title. Not ported: the sibling app has no position question
  (`employee-position.ts` does not exist there). Test:
  `src/app/api/chat/position-answer-guard-e2e.test.ts`.

## 27 Oct 2026: the Assistant Manager has no Forms Register — ported from Ask Sunny (NEXT_PUBLIC_ASD_NO_FORM_MONITORING_ENABLED)

Pau asked that the sibling app's Assistant Salon Director rule apply here to the equivalent role, the Assistant Manager. Same flag (build time, default off): with it on, `assistant_manager` loses `view_form_monitoring` (sidebar, page, Overview follow-ups, chat card link, search hits) but still opens and downloads the forms it created; the location manager and every role above keep it. This replaces the sibling app's earlier "Bubbles: not requested" note. Bubbles prod had no active Assistant Managers on 27 Oct 2026.

## 27 Oct 2026: forms some accounts create are private to them and to admin — ported from Ask Sunny (PRIVATE_CREATOR_FORMS_ENABLED)

Same mechanism as the sibling app's #321: `PRIVATE_FORM_CREATOR_IDS` (user ids, set per app in Vercel, never in the repository) plus the default-off flag; `actorMaySeeInstance` hides those forms from every reader but the creator and admin/owner/developer, on every read path; bounded reads over-read 4x while active and trim back to the page.

## 26 Oct 2026: the reply is not sent on with a date line the conversation already gives — Bubbles-only (DATE_LINE_NO_ECHO_ENABLED)

QA LS-B5: "create ca form for <name> for violating attendance policy on 10-20-26 … jba manual 1-1-26 for previous coaching" / "verbal" dated the form today here. The same two turns in Ask Sunny's production env keep 10/20 on the card and the form (checked 26 Oct 2026: its intent path reads the slots, not the augmented reply). Not ported.

## 27 Oct 2026: a pet at work cites Animals in the Workplace — both apps (ANIMAL_ANYWHERE_ENABLED)

Pau reversed the earlier "no" on 27 Oct 2026. With the flag on, an animal word (puppy, kitten, dog, cat, pet, …) anywhere in a sentence about being at work is the Animals in the Workplace incident (service animal, hot dog and guinea pig stay excluded), and a "cite <policy>" line names that policy without the word "cite". Same flag and mechanism in the sibling app.


## 27 Oct 2026: a step's date is not the incident date — both apps (STEP_DATE_NOT_INCIDENT_ENABLED)

Ported from Ask Sunny (QA SF4). Here "note a verbal ca was given on 9-1-26" dated the card and the form 9/1; with the flag on the step's date is not an incident date and the incident's 9/28 stays. Ask Sunny's sibling fix CA_ASKS_WHAT_HAPPENED is not needed here: this app already asks "You haven't told me what happened yet" on "create corrective action form for <name>, <job title>".

## 27 Oct 2026: a typed job title, and the date question asked again in fresh words

JOB_TITLE_FROM_WORDS_ENABLED: both apps (the fill); asking the position once on an exit form stays Bubbles-only, as Ask Sunny has no position question. DATE_REASK_FRESH_ENABLED: Bubbles-only for now. QA D3 showed this app's re-ask came back byte for byte the same as the reply before (stored messages, conv_mvpyha5v22c52vd), while Ask Sunny's live reply on the same turn showed the question; port it if Sunny is seen repeating a reply.

## 27 Oct 2026: S12 bundle — warning level per clause, title by apposition, exit read-back; the Follow-up read-back is Sunny-only

WARNING_LEVEL_AND_CLAUSE_ENABLED, JOB_TITLE_APPOSITION_ENABLED and EXIT_READBACK_JOB_TITLE_ENABLED are in both apps. FOLLOW_UP_READBACK_CUE_ENABLED (QA item 5, "jba manual 11-1-25" read back as "Follow-up: 11/1/2025") is not needed here: the same turns through this app's chat show no Follow-up line (the sibling app's code-slot read-back writes it; this app's path does not).

## 27 Oct 2026: P5 — the Follow-Up Coaching citation field (both apps); a grammar request on the card (sibling-only)

FOLLOW_UP_CITATION_FIELD_ENABLED is in both apps. GRAMMAR_ASK_NOT_ACCOUNT_ENABLED is not needed here: QA's replay turns through this app's chat do not add "can you clean up my grammar…" to the card (that turn is answered as a question), so there is nothing on the card to take out.

## 27 Oct 2026: S1 follow-ups — level/step clause (both apps); title case (sibling-only)

LEVEL_STEP_NOT_ACCOUNT_ENABLED is in both apps (here the Issue, there the Observation). JOB_TITLE_CASE_ENABLED is not needed here: QA's S1 turns through this app's chat give "Makery Associate" from the title list. (The sibling app dropped its APP_SENTENCES_NOT_ACCOUNT flag before shipping; this app's card shows no state sentences either.) WARNING_LEVEL_AND_CLAUSE's saved-draft fix (QA B1) is this app's: the sibling app's live draft already ticked Written.

## 27 Oct 2026: S1 residuals — read-back title case and the step date in the date question (sibling-only)

JOB_TITLE_READBACK_CASE_ENABLED and STEP_DATE_NO_QUESTION_ENABLED are not needed here: QA's S1 turns through this app's chat, with STEP_DATE_NOT_INCIDENT on, ask no date question (this app's incidentDates already leaves out a step's date under STEP_DATE_NOT_INCIDENT) and read back the title the card has.

## 27 Oct 2026: a decimal point ends no sentence in the Issue (DECIMAL_NOT_SENTENCE_END_ENABLED, Bubbles-only)

Not needed in the sibling app: its card has no Issue / What happened line. The same sentences through its harness ("she was 10 minutes late on 10.2", "… 3.5 hours late and owes $10.25") give an Observation of Offense with both whole.

## 27 Oct 2026: "yes payrol ldeduct" is the payroll answer — this app only (PAYROLL_TYPO_ANSWER_ENABLED)

QA BF7b live. The sibling app already reads the typo as the payroll answer on that turn (checked through its chat with its production flags), so the flag is not needed there.
