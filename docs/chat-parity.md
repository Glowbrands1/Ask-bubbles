# Chat parity with the reference platform

How the reference platform's chat (Ask Sunny) works, what Ask Bubbles reuses,
what stays company-specific, and how the two were compared. Written
2026-10-06 against Ask Sunny `3f5c538` and Ask Bubbles `7a33c86`.

No tenant data, IDs, credentials or project values were copied. Ask Sunny was
read only; nothing in it, or in either Supabase project, was changed.

---

## 1. How the reference chat works

There is **no streaming**. One JSON `POST /api/chat` per turn returns one
complete answer.

1. **Browser** (`features/chat/chat-screen.tsx`, `use-inline-ask.ts`) sends:
   - `question`, `mode` (quick / standard / detailed) and the whole conversation
     as `history`;
   - `questionMessageId`;
   - `continueProposalTemplateKey`: the form intake that is still open
     (`continuationFor`);
   - `activeFormInstanceId`: the draft this conversation created
     (`activeFormInstanceFor`);
   - `reportContext`, which carries pointers only.

   It never sends a role, a scope, a corpus or a date.
2. **Route** (`app/api/chat/route.ts`) runs, in order:
   1. live-mode and configuration guards;
   2. `authorizeRequest(…, "ask_questions")` (session plus `app_users`);
   3. the rate limit;
   4. `openTurn` (analytics);
   5. `parseAskRequest`, which keeps the last 20 messages, sets the corpus to
      `ACTIVE_BRAND.knowledgeScopeId` and sets today to the server's business
      day.

   It then tries three handlers, first match wins:
   - `correctActiveForm`: a header correction to the open draft;
   - `reviseActiveForm`: a rewrite of drafted fields;
   - `answerQuestion`.
3. **`answerQuestion`** (`lib/ai/server-ask.ts`):
   1. **Forms gates first.** These are pure detectors, run before anything is
      read:
      - `detectInventoryQuestion` ("which forms do we have?");
      - `detectTemplateIntent` (which form was named; "a form" with none
        named; the "coach X" clarify);
      - the register-anchor walk ("those documents" means whichever register
        the last turn named);
      - `answersFormClarification`.

      A forms turn is answered from the form library (`form_templates`), never
      from the model's memory, through `proposeFormForTurn`. That path reads
      the manager's own turns to work out who the form is for, the location,
      the date, and what is still missing. **The model never chooses the
      form, the person or the location.**
   2. **Retrieval.** The latest question is embedded (gte-small, through the
      `embed` edge function) and `match_knowledge_chunks` returns the top-k
      chunks:
      - pgvector cosine, with a similarity floor of 0.78;
      - restricted to the current corpus, to indexed documents only, and to
        each document's current version.

      Running in parallel with that:
      - **Pinned reasoning documents** are loaded by identity, not by
        similarity, when a gate fires. A gate tests the question, plus its
        anchor when the question is a follow-up. Some pins are fail-closed: an
        unhealthy one refuses the turn with **no model call**.
      - **A named policy manual** is read by identity, and its table of
        contents or matching sections are pinned.
      - Report briefings and the forms inventory.
   3. **Assembly** (`grounding-assembly.ts`): pinned rows first, then evidence,
      numbered `[S1]…[Sn]`.
   4. **System prompt** (`prompts.ts`): the rules are built from the blocks
      actually attached. Each kind of statement has its own attribution rule:
      company knowledge carries a marker; general guidance is labelled as
      general; report figures name their period; forms-library facts carry no
      marker.
   5. **`callClaude`**:
      - sends the last 10 turns as plain text, plus one user message carrying
        the context blocks and then the question;
      - uses adaptive thinking and an effort setting;
      - sets max tokens by answer mode.
   6. **Citations** are built **from the retrieved rows** at the markers the
      model used. A fabricated title or page cannot become a source card.
      Markers are then stripped from the prose. `coverage` is `insufficient`
      when nothing was retrieved.
4. **Rendering** (`message-bubble.tsx`):
   - rich text;
   - a "not covered by the knowledge base" notice when coverage is
     insufficient;
   - numbered source cards that open the knowledge-base document;
   - form proposal, picker and inline-draft cards;
   - error turns with Retry.

### Why it "knows" what to do

| Behaviour | Mechanism |
|---|---|
| Answer vs search knowledge | Every non-form turn is grounded. "No documents matched" switches the prompt to "say so; offer only labelled general guidance". |
| Ask a clarification | Deterministic: `kind: "ambiguous"` shows the form picker. A person plus an ambiguous verb gets "guidance or a form?". Two people named gets "which of them?". A near-miss name gets "did you mean …?". |
| Who a form is for | `readEmployeeMentions` / `resolveEmployee` over the manager's own turns, in a bounded window. A name given on purpose replaces the current one; a name mentioned in passing never does; "not Jordan" excludes Jordan. |
| Not re-asking | Every turn re-reads all the manager's turns. The browser's continuation key keeps the intake open. The opening questions drop whatever is already known (date, title, location, what happened). |
| Updating the same draft | `activeFormInstanceId`, then `correctActiveForm` / `reviseActiveForm`, re-authorised for edit. A new request, or a different person, is never treated as a correction. |
| Aliases (CA, coaching, exit…) | `detectTemplateIntent` matchers. Explicit namings only; there is never a default form. |
| Names and dates | Case-, quote- and wrapper-insensitive name reading. U.S. calendar dates. Relative dates (in the reference platform, only inside its Exit Form). |
| Grounding, not inventing | The prompt rules; citations built server-side from rows; a forms library that is exhaustive; refusal when a pinned document fails closed. |

---

## 2. Source map

Recommendations: **copy**, **adapt**, **reference-only** (stays
reference-company-specific), or **Bubbles-specific**.

The Status column describes Bubbles **after this change**.

### Shared chat behaviour

| Reference file | What it does | Bubbles status | Recommendation |
|---|---|---|---|
| `features/chat/*`, `lib/chat/*` | Thread UI, composer, history store and sync | Present; only renamed | copy (done earlier) |
| `app/api/chat/route.ts` | Guards, turn lifecycle, correction → revision → answer | Correction step **restored** | adapt |
| `lib/ai/server-ask.ts` | Orchestration | Present, generalised to company config. Clarify hook, history-aware pins and handbook pin **added** | adapt |
| `lib/ai/prompts.ts` | System prompt and grounding block | Present, voice in config. Three dropped generic rules **restored**; handbook note **added** | adapt |
| `lib/ai/call-claude.ts`, `anthropic.ts`, `grounding-assembly.ts`, `errors.ts` | Model call and assembly | Identical. Hard-coded name fixed | copy |
| `lib/ai/mock-provider.ts` | Demo answers | Present. Clarify exemption **restored** | copy |
| `employee-performance-gate.ts` (`isEllipticalFollowUp`, `findContinuationAnchor`) | Follow-up → anchor walk | **Ported** as `lib/ai/continuation.ts` | adapt |

### Knowledge and retrieval (Woven content lands in the same tables)

| Reference file | What it does | Bubbles status | Recommendation |
|---|---|---|---|
| `knowledge/providers/supabase.ts` | `match`, `fetchRoleGrounding` | Identical. `fetchNamedHandbook` **added**, a config-driven `fetchOfficialPolicyManual` | adapt |
| `match_knowledge_chunks` migration | pgvector search | Body identical. Bubbles also locks knowledge reads to the server only (stricter) | Bubbles-specific |
| `knowledge/document-roles.ts`, `role-grounding.ts` | Pinned-document identity | Generalised to `PINNED_KNOWLEDGE_ROLES` (empty for Buff) | Bubbles-specific |
| `ai/policy-manual-coverage.ts` + the identity half of `forms/official-policy-manual.ts` | Pins a named manual's table of contents or sections | **Ported** as `lib/knowledge/named-handbook.ts`. `NAMED_HANDBOOK = null` for Buff | adapt |
| `knowledge-sync/woven/*`, `ingestion/*`, `embeddings/*`, `functions/embed` | Woven to knowledge base; ingestion; embeddings | Present, only renamed | copy (done earlier) |
| `daily-stats-gate.ts`, `performance-management-gate.ts`, employee-facts block | The reference company's frameworks and reports | Absent | reference-only |

### Forms (architecture shared, catalogue per company)

| Reference file | What it does | Bubbles status | Recommendation |
|---|---|---|---|
| `forms/library.ts`, `catalog.ts` | The reference company's form seeds | Replaced by `config/company/forms/` | Bubbles-specific |
| `forms/template-intent.ts` | Which form was named | Registry-driven. `clarify` kind **ported** (driven by `clarifyOn`) | adapt |
| `forms/form-clarification.ts` | "Guidance or a form?" and the reply | **Ported**; the question is built from the form's own name | adapt |
| `ai/form-proposal.ts` | Proposal, intake continuation, opening questions | Present. Clarify branch, `describesIncident`, `isQuestion` and "keep this as" **ported** | adapt |
| `forms/chat-correction.ts` | Correcting a created draft | **Ported** shell. Header lines only (`chatCorrectableFields`) | adapt |
| `forms/exit-facts.ts` (`dateTokens`) | yesterday / last Friday | **Ported** as `forms/relative-date.ts` | adapt |
| `forms/corrective-action-intake.ts` (`describesIncident`) | "Already said what happened?" | **Ported** as `forms/incident-reading.ts`, without trade words | adapt |
| `forms/proposal.ts`, `proposal-continuation.ts`, `proposal-currency.ts`, `employee-match.ts`, `employee-roster.ts`, `bounded-context.ts`, `form-date-*.ts`, `inline-draft.ts`, the draft route | Who, where, when; directory check; stale cards; drafting | Present (an earlier port) | copy (done earlier) |
| `forms/form-opportunity.ts` | Offering forms without being asked | Hook present, returns none | Bubbles-specific until Buff defines the rules |
| Corrective-action ladder, "CA" shorthand, EPP family, exit / demotion / transfer readers, payroll deduct, coaching framing, prior actions, policy manual sections | The reference company's HR process | Absent | reference-only |
| `forms/salon-mention.ts` short-name and city aliases | Shortened location names | Bubbles has only number / full-name matching | adapt, once Buff's roster exists |
| `forms/team-subject.ts` | "Coaching for the whole team" | Absent | adapt, behind a registry flag, if Buff wants it |

### Authentication and access

| Reference file | What it does | Bubbles status |
|---|---|---|
| `lib/auth/*`, `lib/api/*` | Session, `app_users`, `authorizeRequest`, rate limits | Present; only renamed |
| `lib/permissions/index.ts` | Role and permission matrix | Moved to `config/company/access.ts` |
| `reporting/scope/server.ts` | Scope resolution | Adapted to the location roster |

Role and scope always come from the server, never from the request body. The
corpus is a server constant (`bcs-core`). Chat tables are server-only. Each
company runs its own Supabase project.

---

## 3. What changed in Ask Bubbles

| Area | Change |
|---|---|
| Correcting a created draft | `lib/forms/chat-correction.ts`, run before revision in `/api/chat`. Handles "change the date to yesterday", "change the name to …" and "actually her name is …". Re-authorised for edit. Refuses a finalized form, a new request, or a different person. Saved as the manager's own edit. A form opts in with `chatCorrectableFields` (the example form: name and date). |
| Relative dates | `lib/forms/relative-date.ts`: today / yesterday / tomorrow / last or next weekday, relative to the business day. A bare weekday or two different days resolves to nothing, so the manager is asked. |
| Not asking twice | `describesIncident` drops the "what should the form cover" question once it has been answered, and keeps an intake open on an account with nobody named. `isQuestion` no longer treats "did not show up" as a question. |
| Guidance or a form? | `clarify` intent plus `form-clarification.ts`, driven by `clarifyOn: { verb, noun }` per form. **Off for every shipped Buff form.** The bare noun next to an advice cue ("tips for coaching Avery") stays advice. |
| Follow-ups keep their pinned documents | `lib/ai/continuation.ts`. `PINNED_KNOWLEDGE_ROLES` triggers test a fragment together with its anchor. |
| Named handbook | `lib/knowledge/named-handbook.ts` plus `fetchNamedHandbook`, configured by `NAMED_HANDBOOK` (**null** until Buff supplies a handbook). |
| Prompt | Three generic rules restored: the knowledge-base vs forms category lists; "the form has not been created yet — ask for it by name and person"; why form fields are never described. |
| Clean-up | The reference company's trade words removed from name stop-lists ("Sun" and "Tan" are real names). Hard-coded "Bubbles" string. Misattributed comments. |

**Endpoints and integrations used: unchanged.** Ask Bubbles uses:
- `/api/chat` and `/api/forms/*` on its own deployment;
- the Ask Bubbles Supabase project (its `match_knowledge_chunks` and its
  `embed` edge function);
- Anthropic, server-side;
- Woven only through its own off-by-default adapters.

No new endpoint, table or migration was added.

---

## 4. QA

### Side by side

The same conversations were run through each app's **real** pipeline, in each
repository, with only the model call replaced.

Knowledge (`src/test/parity/knowledge-parity.qa.test.ts`) uses:
- PGlite with pgvector and each app's own migrations;
- the real ingestion and `match_knowledge_chunks`;
- a fictional corpus;
- a similarity floor lowered identically in both apps for the lexical test
  embedder.

| # | Scenario | Reference | Bubbles |
|---|---|---|---|
| K1 | Simple question with a source | Attendance Policy, cited, grounded | **identical** |
| K2 | Several possible sources | Both attendance documents, both cited | **identical** |
| K3 | No reliable source | Nothing cited, `insufficient`, "no documents matched" | **identical** |
| K4 | Follow-up on a new subject | History sent (2), Break Policy | **identical** |
| K5 | "and for part-timers?" | History sent; **nothing retrieved** | **intentionally different** since §7: the part-time attendance guidance is retrieved and cited (identical to the reference with `KNOWLEDGE_FOLLOW_UP_RETRIEVAL=off`) |
| K5b | A whole new question after an attendance answer | Dress Code only | **identical** |
| K6 | Citation rendering, with an invalid `[S9]` | Only real rows cited; markers stripped | **identical** |
| K7 | "What's the policy?" | Nothing retrieved, `insufficient` | **identical** |
| K8 | Correcting the previous message | Dress Code found | **identical** |
| K9 | 14-turn conversation | 14 reach `callClaude`, which keeps the last 10 | **identical** |
| K10 | Another company's corpus in the same database | Never retrieved | **identical** |

Forms and names were replayed through `proposeFormForTurn` and
`continuationFor`. The reference app used its Coaching Form; Bubbles used the
fixture coaching note, which opts into the same behaviours. 21 of 23 turns
behaved the same:
- "coach Avery" → "guidance or form?", then "the form" → a proposal for Avery;
- a person already known is not re-asked;
- full, lower-case, upper-case, quoted and first-name-only names;
- two people → "which of them?";
- "No, not Jordan. Avery." replaces the person;
- advice stays advice;
- "a form" → the picker;
- a question asked mid-intake is answered;
- "late yesterday".

The two differences:

| Turn | Reference | Bubbles | Why |
|---|---|---|---|
| "missed the opening checklist today" (no pronoun) during an intake | Ends the intake | Continues it | Intentional: the incident reader also accepts a sentence that opens with the verb |
| "CA for Avery" | Corrective Action Form | Ordinary answer | Intentional: "CA" is the reference company's shorthand. A Buff form adds it to `intentPhrases` if wanted |

### Regression suites in Bubbles

- `lib/ai/chat-behaviour-parity.test.ts`: conversation replays.
- `lib/forms/chat-correction.test.ts`: in-place correction, finalized forms,
  unauthorised edits, opt-out, new requests, other people.
- `relative-date.test.ts`, `continuation.test.ts`, `named-handbook.test.ts`.

Access restrictions are covered by the existing suites (`actor-authority`,
`corpus-authority`, `rls_checks.sql`).

---

## 5. Remaining differences and blockers

1. **Follow-up retrieval — fixed in Ask Bubbles, not yet in the reference
   platform.** See §7. "and for part-timers?" now retrieves; every other
   side-by-side scenario is unchanged.
2. **Correction scope differs on purpose.** The reference platform corrects
   name and date only on its employment-change, exit and payroll forms.
   Bubbles corrects header lines on any form that opts in.
3. **`max_tokens` truncation (both apps).** A truncated answer is returned as
   if complete.
4. **Empty Buff configuration.** The live Bubbles project has no knowledge
   documents, no employee directory and one example form. Until Buff supplies
   content, live answers will correctly say the knowledge base has nothing.
5. **Not ported, pending Buff decisions:**
   - proactive form offers;
   - "whole team" forms;
   - shortened location names (they need the roster);
   - a handbook identity;
   - pinned rule documents;
   - per-form `clarifyOn` and `chatCorrectableFields` for real Buff forms.

## 6. Production changes still required

None by this change: it is code only, with no migration and no environment
variable. To make use of it:

- Deploy the branch to the Ask Bubbles Vercel project.
- Configure it once Buff supplies the material:
  - `NAMED_HANDBOOK` and a document tag, when a handbook is uploaded or synced;
  - `clarifyOn` / `chatCorrectableFields` on real Buff forms;
  - `PINNED_KNOWLEDGE_ROLES` for any rule document.

The existing handoff blockers are unchanged: Vercel project, secrets, Woven
credentials and Buff content (`docs/HANDOFF.md`).

---

## 7. History-aware retrieval (Ask Bubbles only, switchable)

**The limitation.** Both apps embedded only the newest message, so "and for
part-timers?" searched for "part-timers" alone and retrieved nothing.

**The change** (`lib/ai/continuation.ts`: `retrievalPlan`, `searchWithPlan`;
used in `server-ask.ts`):

1. A question that stands on its own is searched exactly as typed — no change.
2. A FRAGMENT ("and…", "what about…", "why?", a bare name — the reference
   platform's own `isEllipticalFollowUp`) is searched as typed FIRST.
3. Only if that finds nothing is it searched again as *anchor + question*,
   where the anchor is the nearest standalone MANAGER turn (the same bounded
   walk the pinned-document gates use). An assistant answer is never embedded,
   so a model's wording can never steer retrieval.
4. Only the query changes. The model is given the question as typed;
   citations are built from retrieved rows; corpus, scope and similarity
   floor are unchanged.

Why a fallback rather than always merging: "What about breaks during a
shift?" is a fragment by its opening but names its own subject. Always adding
the anchor pulled the previous topic's Attendance Policy into an answer about
breaks; as a fallback, that question is searched exactly as the reference
platform searches it, and only the turns that found nothing are rescued.

**Switch:** `KNOWLEDGE_FOLLOW_UP_RETRIEVAL=off` (server environment) restores
single-message retrieval with no code change. Default: on.

**Sharing it with the reference platform later.** The reference platform
already has `isEllipticalFollowUp` and `findContinuationAnchor` (in its
employee-performance gate). Porting is: lift those two into a shared module as
here, add `retrievalPlan` / `searchWithPlan`, and replace its single
`knowledge.match({ query: request.question, … })` in `answerQuestion` with
`searchWithPlan(retrievalPlan(question, history), …)`, behind the same
variable. Its side-by-side harness (`src/test/parity/knowledge-parity.qa.test.ts`,
which runs unchanged in both repositories) then shows K5 change and nothing
else. A shared package is not recommended yet: the two apps' `server-ask.ts`
have diverged by design, and a copied 150-line pure module with a shared test
file is cheaper to keep in step than a dependency.

---

## 8. Buff City Soap Woven knowledge behind this chat

The Midwest Soap Makers connector (`294775b`, `f7d018a`, built in its own
session) is merged into this branch. Its own documentation is
[docs/woven.md](woven.md). It plugs into the existing knowledge-sync engine and
writes into the same `knowledge_documents` / `knowledge_chunks` the chat
already reads, so **the chat route and answer path contain no Woven or
company-specific code**: grounding, citations, follow-ups and refusals apply to
synced Woven content exactly as to an upload.

```
Woven (Midwest Soap Makers only; Company ID proved on /Company)
  → BCS connector + company guard → publication / audience / ownership rules
  → sync engine + reconciliation → knowledge sink → ingestion
  → Ask Bubbles Supabase (knowledge_documents / knowledge_chunks)
  → match_knowledge_chunks (+ follow-up fallback, §7) → answerQuestion → /api/chat
```

### End-to-end QA — FIXTURES, NOT LIVE

`src/lib/knowledge-sync/woven/bcs/bcs-chat-isolation.integration.test.ts`
drives the connector's sanitized fake Woven — three companies on one login —
through the real connector, guard, engine, reconciliation, Supabase sync store
and sink, ingestion and `match_knowledge_chunks` (the repository's migrations
on PGlite), then asks through the real `answerQuestion`. Only the model call
and the embedder are replaced; "never retrieved" is checked on what actually
reached the model.

| Area | Cases |
|---|---|
| Knowledge | named procedure (cited by Woven title; invalid marker never a card); multi-source; no answer; "and then what?" (retrieved via the manager's question, never the answer text); unrelated whole question after a topic |
| Fails closed | managers-only procedure; draft; unpublished File Library item; ambiguous-audience item; JBA document; Sun Tan City document; a third company's document; policy awaiting publication verification; File Library document while downloads are disabled; an administrator trying to share the managers-only audience |
| Company guard | sign-in that lands in JB & Associates or a third company (at the scan and at the sync): no content read, nothing ingested; session that switches to JB mid-run: nothing of it ingested and nothing of ours removed |
| Reconciliation | unpublished, restricted to managers, moved to an unclear audience, deleted, approval withdrawn by an administrator: each leaves chat after the next sync; a newly shared procedure enters it |

**Mutation-tested.** Each safeguard was disabled in turn and the suite had to
fail: the company-page guard (3 tests fail), the rule that an administrator
cannot share a narrow audience (1), the publication filter (3), and retirement
on a withdrawn approval (1). Two first attempts did not fail, and that found a
vacuous test (a sync run before any scan was refused before signing in) and a
mutation of a display-only field; both were corrected.

Live QA against the real Midwest Soap Makers account has **not** been run: it
needs the `WOVEN_BCS_*` credentials and the Ask Bubbles server keys.
