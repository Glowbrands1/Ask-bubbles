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

It is never inferred from the template or the incident. A Woven store that
differs from the one the manager named is stated; a matched employee with no
mapped Woven store is told to the manager rather than guessed.

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
| `src/features/chat/message-bubble.tsx` | Card shows the store by name and a Position row |
| `src/types/index.ts` | `locationCandidates`, `employeeRoleSource` (optional; old stored conversations still read) |
| `src/lib/ai/corrective-action-conversation.test.ts` | Two tests asserted Ask Bubbles *never* mentions job title — the opposite of the request; updated to "asked once, never as a numbered questionnaire item" |

No migration, no configuration change, no new dependency.

## Verification

RESULTS_PLACEHOLDER

## Open items and dependencies

OPEN_PLACEHOLDER
