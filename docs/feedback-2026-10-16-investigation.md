# Admin feedback of 16 Oct 2026 — investigation and fixes

Three unresolved reports from Marissa (Admin), all left on 16 Oct 2026. This
document is the investigation, the evidence, the fix and the verification.
Nothing in production was modified: every database query was a read-only
`SELECT` against the Ask Bubbles project, no Woven record, form submission or
configuration was touched, and no feedback row has been marked resolved.

**Redaction.** Employees appear as Employee A / B / C. No names, e-mail
addresses or Woven identifiers appear below. Conversation text is quoted only
where it carries no employee detail.

## The records

| Feedback record | Rating | Comment (verbatim) | Conversation |
|---|---|---|---|
| `6653923f…` 14:41 UTC | 1 · "No" | "I gave bubbles all of the information for a CA that it should need and it still would not populate the form." | A — Employee A, lateness |
| `e05eb346…` 15:07 UTC | 3 · "Partially" | "It does not seem to be pulling the correct locations. Also I would like it to ask the position of the employee." | B — Employee B, dress code |
| `2ee6894c…` 15:45 UTC | 3 · "Partially" | "It is not referencing the policy that should be acknowledged." | C — Employee C, dress code |

All three are `pending`. The reporter's role is `admin` with a **global**
scope, which matters for Issues 2 and 3 (see below).

---

## Issue 3 — "it still would not populate the form" (highest priority)

**Original request (Conversation A).** "My employee [name, lower case] was 10
minutes late on her last two shifts. On the first shift I verbally coached her
… Please create a CA form so I can document. She was late on 10/5 and 10/15."

**Expected.** A Corrective Action Form for Employee A, dated from the
conversation, with the prior coaching and the store carried onto it.

**Actual, turn by turn (from the stored conversation and its card metadata).**

| Turn | What Marissa said | What Ask Bubbles did |
|---|---|---|
| 1 | The full request above | Card `dpoa` with `status: needs_employee`. Replied *"Who is this Corrective Action Form for? Give me their name…"* — the name was in the sentence. |
| 2 | "I already told you the employee name. She is at Dodge" | **No card at all.** The turn left the form intake and was answered as free-form chat: *"…just ask me directly: 'create a Corrective Action form for…'"* |
| 3 | "I gave bubbles all of the information it should need, but it still would not generate the coaching form." | Switched to a **Coaching Form** (the word "coaching" matched), asked for name and job title again. |
| 4 | Name (typo'd) + "she is at Dodge. She is a makery associate" | Coaching card `ready`, `locationResolution: not_applicable`, `employeeRole: null`. *"Your account covers every location, so this form won't name one."* |
| 5 | "she is at Omaha dodge" | Identical card. Store still not read. |

A real form *was* eventually created, but it was the wrong form (Coaching, not
Corrective Action) with no store and no job title.

**Root causes, each reproduced in a unit test against the original code.**

1. **A lowercase name after "my employee" is not read.** `readEmployeeMentions`
   accepts a lowercase name only after "employee named …". "my employee
   tiffany lempka …" returned *missing*, so the first reply asked for what had
   been given. *(`src/lib/forms/proposal.ts`)*
2. **A reply that only gives a store, or objects to being asked again, ends the
   intake.** `continuesIntake` recognised a name, an incident, a date, a topic
   or "she/he/they …" — not a store, a position, or "I already told you". Turn
   2 therefore fell to retrieval and the open Corrective Action was dropped.
   *(`src/lib/ai/form-proposal.ts`)*
3. **Store names never resolved** (Issue 2 below) — so even when the intake
   survived, the store never reached the form.
4. **No position was ever read from Woven or asked for** (Issue 2 below).

**What was *not* the cause** (checked and ruled out):

* Conversation context retention, tool-call arguments, field IDs and the
  required-field validation: the Corrective Action created in Conversation B
  has every checkbox the manager stated (`warning_type = verbal`,
  `payroll_deduct = no`, `offense_type = dress_code`), the observation, the
  action plan, and a policy block with provenance. *(An earlier note of mine
  that the checkboxes were empty was a misread of the text column — they are in
  the separate `checked` column.)*
* Frontend/backend errors: none logged; the create/draft calls succeeded.
* Policy or employee lookup failures blocking population: the form populates
  regardless; those failures cost it its **store and job title**, not its body.

**Fix.** Lowercase "my/our employee <name>" is read (document words, verbs and
topic words still refused — "my employee handbook" names nobody). A store, an
answer to the position question, or "I already told you" now continues the
open intake. See Issue 2 for stores and positions.

### Follow-up: which date goes on the form

"She was late on 10/5 and 10/15" dated the Corrective Action **10/5** — the form
took the *first* non-follow-up date in the message, which for a repeated
behaviour is the earlier incident. Three dates can be in a conversation and they
are not the same thing:

| | Example | What happens now |
|---|---|---|
| Incident dates | late on 10/5 and 10/15 | Every one stays in the written description. |
| Earlier steps | "I verbally coached her on 10/5", "verbal warning on 9/21" | History only — never the form's date. (The "I coached her on …" phrasing was not recognised as history before; now it is.) |
| The form's Date | the Date line | One date, chosen on purpose. |

One incident date dates the form, as before. **Several** are asked about once
("Which date goes on the form? Say 'most recent' (10/15), pick one, or say
'today'") and until the manager chooses, the form carries the day it is created
— never whichever incident was typed first. Dates after today, follow-up dates
and earlier steps are not counted. A bare reply ("most recent") continues the
open intake. *(`src/lib/forms/incident-dates.ts`, `form-date-answer.ts`)*

---

## Issue 2 — wrong stores, and "ask the position of the employee"

### Stores

**Evidence.** Conversation B: *"…DJ… at Kearney…"* then *"Use Kearney as the
location"* → card `locationResolution: not_applicable`, `locationId: null`
both times. The saved Corrective Action has `location_id = NULL` and no
Location line. Conversation C ("our Grand Island location") only got a store
after Marissa picked it from a list.

**Root cause.** The location reader was ported from the reference platform
along with its test roster, whose stores are named with a state **prefix**
("NE Kearney"). Buff City Soap's roster is **city first**:
`Kearney, NE`, `Omaha, NE (West Dodge Rd)`, `Sioux Falls, SD (E 18th St)`.
The alias generator only stripped a leading state, and the nickname and
abbreviation tables ship empty, so **only `Kearney NE` (with the state), a store
number, or the exact full name matched**. "Kearney", "Grand Island", "Dodge",
"Omaha dodge", "Lee's Summit" and "Sioux Falls" never did. Every location test
mocks the roster with the reference fixture, so nothing noticed. A global scope
(an administrator) then reads an unresolved store as *"your account covers every
location, so this form won't name one"* — silently, as if that were an answer.
*(`src/lib/forms/location-mention.ts`, `src/lib/forms/location-scope.ts`)*

Two further defects surfaced while writing the regression tests:

* a comma straight after a store ("at Lee's Summit, out of dress code") removed
  the boundary that marks "at <place>" as a place;
* a later, more specific answer ("E 18th St") did not narrow an earlier
  ambiguous one ("Sioux Falls"), and "at Kearney and Bellevue" silently dropped
  Bellevue.

**Fix.** Aliases are now **derived from the authoritative roster** — city, the
road in parentheses, the road without its direction/suffix ("Dodge"), and
city+road combinations — with no hand-entered business data. Roads that are only
a number ("41st") never stand alone. A city two stores share names **both**
(`needs_selection`, and the reply names only those two). Cues now include
"use X", "X as the location", "location is X", a turn that is only the place,
and the second item of "at X and Y". Punctuation is kept as a boundary. A later
specific answer narrows an earlier vague one. A store the manager names that is
outside a scoped manager's assignment is still refused. The card and reply now
**read back the store by name** (it showed the raw id `loc-264` before).

Store **code** matching (`store 66`, `#264`) already worked and is covered.
Admin store/Woven mapping is unchanged.

### Position

**Evidence.** `employeeRole: null` on every card in all three conversations;
the saved forms have no Job Title. All 83 rows in `employee_access_directory`
carry a Woven `position_name`; nothing in the application read it
(`employee-roster.ts` selected name, status and locations only).
The one title Marissa did type ("makery associate") matched no title pattern.

**Fix.** The roster now reads `position_name`. For the forms with a Job Title
(Corrective Action, Coaching, Follow-Up Coaching, Policy Review):

1. the manager's own title wins — typed, or given as the answer to the question;
2. otherwise the **matched** employee's Woven position is used and **read back**
   ("Position: X, from Woven — tell me if that has changed");
3. a disagreement between the two is stated, never silent;
4. with neither — including a terminated employee (never matched) or a Woven row
   with no position — it is **asked once**, and the answer is taken from the next
   short reply ("she's a shift lead", "makery associate").

It is never inferred from the template or the incident.

**Verified before populated.** Woven data is used only for an employee the
directory matched *exactly* (or the manager confirmed — a close spelling is a
"Did you mean…?" question first), never a terminated one, and only through the
reviewed `mapped` Woven→store decisions (an unmapped Woven location is never
used). The read-back says whose word each fact rests on:
"Location: Kearney, NE, **from Woven** (where X is assigned)" versus "…**as you
said**". A Woven store that differs from the one the manager named is stated, and
the manager's word stands. With **no verifiable store** — none named, none mapped
in Woven, an employee with several stores, or the directory unreadable — the
manager is asked once ("which store they work at") or, for several stores, which
one; the form is otherwise created without a location rather than with a guessed
one. Same for position.

---

## Issue 1 — "not referencing the policy that should be acknowledged"

**Evidence.** Conversation C: Employee C was out of dress code three shifts and
had been coached verbally on the second. Ask Bubbles' own answer said a
Corrective Action was the right next step ("a Corrective Action Form is built
for exactly this: it records the warning and quotes the policy she's not
meeting") — but the card it offered was **Coaching only**
(`formSelection.additional: []`). Marissa pressed it. The Coaching Form has **no
policy field at all** (checked in the live template version), so nothing could
reference the policy. The comparable Corrective Action in Conversation B **does**
carry it: Policy Violated "Dress Code Violation" and Direct Policy quoting the
official manual's *Dress Code for The Company* section with its source line,
from a pinned-by-identity lookup (not similarity search).

**Retrieval itself is healthy.** The knowledge base holds exactly one
`policies_compliance` document, the 2025 JBA Policy Manual, indexed, current
version, not superseded; the Corrective Action path pins it by identity, finds
the section by the manual's own printed heading and page, fails closed (blank,
never invented) when the section or manual is missing, and refuses a
model-invented policy. That behavior is unchanged and now has end-to-end tests.

**Root cause.** The form picker never offered the Corrective Action Form to
someone who had already tried the first rung and was seeing the behaviour repeat
— it required the manager to say "corrective action", "written warning" etc.
themselves. The assistant's text and its card contradicted each other.
*(`src/lib/forms/form-opportunity.ts`)*

**Fix.** "Prior coaching/talk + still/again/continuing" is now a formal-step
signal: the Corrective Action Form is offered **beside** Coaching (never first,
never created without a click). A coaching that worked ("…and she improved") or
a first offence raises nothing.

**Not changed — needs a decision (see "Open items").** Coaching Forms are
deliberately policy-free (the drafting prompt forbids citing a policy there).

---

## Defects found while verifying (fixed)

* **A bare answer was read as the employee's name.** "barista", "most recent" or
  "Kearney" typed in reply to a question is the whole message, and the name
  reader takes a whole short message for a name — so the answer replaced the
  employee, **and the create route's currency check then refused the card**
  ("the conversation now says the form is for most recent"). The turns that
  *really are* an answer to the position, date or store question are now skipped
  by the name readers on both the proposal and the create route; a correction
  ("actually make it Jordan Vance") or a two-word name is still a name.
  *(`src/lib/forms/question-answers.ts`, `proposal-currency.ts`)*
* A roster comma/line break lost the "this place has ended" boundary; "at
  Kearney and Bellevue" dropped Bellevue; a later specific answer did not narrow
  an earlier vague one (all under Issue 2).

## Code changes

| File | Change |
|---|---|
| `src/lib/forms/location-mention.ts` | Aliases derived from roster (city / road / combos), new cues, boundaries, list handling |
| `src/lib/forms/location-scope.ts` | Narrow vague mentions by specific ones; flag ambiguity |
| `src/lib/forms/proposal.ts` | Lowercase "my/our employee <name>"; ambiguous-store candidate names on the proposal |
| `src/lib/forms/employee-position.ts` (new) | Position question, answer reader, "asked once" |
| `src/lib/forms/employee-roster.ts`, `employee-match.ts` | Read Woven `position_name` |
| `src/lib/ai/form-proposal.ts` | Intake continuation; position + store notes from the directory; store read-back; ambiguous-store question |
| `src/lib/forms/form-opportunity.ts` | Corrective Action offered after prior coaching + recurrence |
| `src/config/company/job-titles.ts` | "Makery Associate" |
| `src/lib/forms/incident-dates.ts` (new), `form-date-answer.ts` | Several incident dates are asked about once; "I coached her on …" is history |
| `src/lib/forms/question-answers.ts` (new), `proposal-currency.ts` | Answers to the position / date / store questions are not names |
| `src/features/chat/message-bubble.tsx` | Card shows the store by name and a Position row |
| `src/types/index.ts` | `locationCandidates`, `locationSource`, `employeeRoleSource`, `formDateCandidates` (all optional; old stored conversations still read) |
| `src/lib/ai/corrective-action-conversation.test.ts` | Two tests asserted Ask Bubbles *never* mentions job title — the opposite of the request; updated to "asked once, never as a numbered questionnaire item" |

No migration, no configuration change, no new dependency.

## Verification

All results are from the final state of the branch (commit following this
document), run in this environment.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no errors |
| `npx eslint` (whole repo) | exit 0 — **0 errors**, 9 warnings, all in files this branch does not touch |
| `npx vitest run` (whole suite) | **354 files passed, 6 skipped; 8,533 tests passed, 59 skipped; 0 failed** (baseline before this work: 348 files / 8,378 tests) |
| New regression tests | `admin-feedback-oct16-e2e.test.ts` (real routes, real Buff roster, admin global scope, synthetic employees), `location-mention-buff-roster`, `employee-position`, `incident-dates`, `question-answers`, `form-opportunity-escalation`, plus lowercase-name cases in `employment-change.test.ts` |
| Playwright (`e2e/admin-feedback-oct16.spec.ts`) | **6/6 passed** (3 scenarios × desktop and mobile) |
| Playwright (entire suite) | 108 passed, 10 skipped (screenshot capture specs), **2 failed** — `backgrounds.spec.ts › sidebar pattern` on desktop and mobile. **Pre-existing:** the same two fail identically on the original commit `3d6a6e7` in a clean worktree; it is a pixel comparison of the nav rail, which this branch does not touch. |

**Do the new tests guard the bugs?** Run against the original source, 18 of the
first 23 end-to-end cases failed (the other five assert behaviour that already
worked: the manual-cited policy, its fail-closed blank, and so on).

### The complete conversation (requirement 5)

`a manager who gives everything is never asked for it again` plays four turns:
employee (lowercase) + position + store; incidents on two dates and an earlier
coaching date and the policy to use; the date choice; warning level and payroll
answer. It asserts each fact is asked for at most once and never after it was
given, that the card ends `ready` with the right employee, position (the
manager's, marked as theirs), store, date (10/12), warning level and payroll, and
that the created form has `job_title`, `form_date`, `location`, `warning_type`,
`payroll_deduct`, `offense_type`, the observation naming both incident dates, the
prior-coaching line, and a policy block that is the official manual's own
Dress Code section with its source line and printed page.

### Browser verification — what it does and does not prove

The demo build cannot run the server's proposal flow, so the Playwright spec
seeds the exact assistant turns the end-to-end suite produces (the fixture
`e2e/fixtures/admin-feedback-oct16.json` is asserted equal to the server's
output by that suite, so it cannot drift) and checks the built chat screen on
desktop and phone: the store shown **by name** (never `loc-264`), the position
and "from Woven", the two-store question naming only those two with no Create
button until one is chosen, and the missing-position prompt on the card and in
the reply. **It does not exercise a live Supabase/Woven/Anthropic session** —
no production credentials or data were used, as instructed. The server logic is
covered by the end-to-end tests above, against the real create/draft/review
routes with an in-memory database.

## Open items and dependencies

1. **Coaching Form and policy — decision needed, nothing changed.** The Coaching
   Form has no policy field and its drafting rules forbid citing a policy
   (general coaching, not a quotation of a rule). This branch does **not** add one.
   The fix for Issue 1 is routing: when coaching was already tried and the
   behaviour repeats, the Corrective Action Form — which carries the policy,
   quoted from the official manual — is offered next to Coaching. If Marissa
   also wants a policy *reference* on Coaching, that is a template change for
   you to approve.
2. **Policy accuracy rests on one document.** The knowledge base has exactly one
   `policies_compliance` document (the 2025 JBA Policy Manual). Citations come
   from its own headings and printed pages; a section it does not contain stays
   blank for the manager. A re-issued manual with different headings would be
   followed without a code change, but a deployment where two documents claim
   to be the official manual cites none.
3. **Woven data gaps (data, not code).** One employee in Marissa's conversations
   has no *mapped* Woven store, so Bubbles asks for it instead of guessing; the
   Woven location map has seven `mapped` stores and six rows a person marked
   `ignored` (none unmapped), so only those seven can ever supply a store. Three directory rows are
   `terminated` and are deliberately never matched. Fixing the data would let
   more forms be populated without a question.
4. **Position values are Woven's wording** ("Operator", "Human Resources
   Generalist"), shown to the manager for correction; the position→role map
   (`woven_position_map`) is unchanged and unused here.
5. **Nicknames and abbreviations remain empty by design** — aliases are derived
   from the roster only. If managers use a nickname that is not in a store's
   name (for example a neighbourhood), Buff would add it to
   `COMPANY_LOCATION_NICKNAMES`.
6. **Dates:** a date typed without a year takes the current year; a manager
   writing in January about December must give the year (the Date field stays
   editable). The form's Date is still one date; Bubbles does not create several.
7. **Browser coverage is demo-mode plus seeded server output** (see above). A
   signed-in retest by Marissa on a deployed preview is the one check this
   environment cannot do.
8. **Two pre-existing Playwright screenshot failures** (`sidebar pattern`) are
   unrelated; they fail on the original commit too.

## Feedback status

All three feedback records remain **`pending`**. Nothing was marked resolved or
dismissed, and nothing in the database, Woven or production configuration was
modified. After deployment approval, Marissa should retest her three original
scenarios (the lateness Corrective Action given in chat; the dress-code
Corrective Action at a named store; the dress-code situation where coaching was
already tried) and only her confirmation should move those records forward.
