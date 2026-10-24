# Parity log: Ask Sunny ↔ Ask Bubbles

This app is a port of Ask Sunny (`Glowbrands1/ask-sunny`); see
`docs/chat-parity.md`. Every fix to chat, forms, Corrective Action, policy
citation, access or sync is either ported to the sibling or listed here as
staying one-sided, with the reason.
See `CLAUDE.md`.

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
