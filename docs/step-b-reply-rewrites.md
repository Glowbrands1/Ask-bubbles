# Step B: every reply the diff block can rewrite

`FORM_REPLY_FROM_DIFF_ENABLED` (with `FORM_PATCH_REDUCER_ENABLED`; both default off).
QA asked for this list before either flag is turned on.

## What the diff block does

In `src/app/api/chat/route.ts`, when both flags are on and a form is open
(`activeFormInstanceId`):

1. Before the answer cascade, the open form is read under "view" authorization
   (`snapshotForm`, `src/lib/forms/form-snapshot.ts`): the header (Employee,
   Position, Store, Date, Follow-up date) and every value row.
2. After the cascade, if the answer came from one of five paths (**correction**,
   **policyChange**, **redraft**, **sameCopy**, **revision**), the form is read again
   and the two snapshots are diffed.
3. If the answer carried a `formUpdate`, or the saved form changed, the reply
   is replaced:
   - `content` becomes `replyFromDiff` (`src/lib/forms/form-diff-reply.ts`): one
     line per changed field, `Changed <Label> to "<value>".` (a value over 120
     characters is cut at a word, with "…"), or `Cleared <Label>.`. When nothing
     changed, it is `I didn't change anything on the form.`
   - `formUpdate` becomes the changed keys. When nothing changed, there is no
     `formUpdate`.
4. Otherwise the reply is left exactly as the path wrote it. This covers an
   answer with no `formUpdate` and no change, such as a refusal, a question back
   to the manager, or "I haven't changed …".

The block never runs for:

- a patch turn, whose reply is already the diff (`form-patch-turn.ts`);
- a draft action (`draftAnswer`);
- the name-correction refusal (`nameNotCorrectedReply`);
- `which`, `reopened`, or an ordinary answer. These keep `honestFormReply`, as
  today.

It also does not run when the answer's `formUpdate` names a different form
from the open one, for example the new draft a finalized form is revised into.

**What is dropped:** everything the path said besides the diff. That is the
cost the proposal names: "Replacing a path's reply with the diff sentence
drops that path's guidance lines." Each guidance line a path can add is listed
below.

---

## 1. correction (`src/lib/forms/chat-correction.ts`)

These replies are rewritten whenever they carry a `formUpdate`. All of the
"Updated the …" replies do.

| Today | With the flag |
|---|---|
| `Updated the **<Form>** for **<Name>**: <Label> → <value>; ….` (employment facts, payroll, amount, Date) | `Changed <Label> to "<value>".` per saved change, including the paragraph and Action Plan changes the correction made |
| `Updated the **<Form>** for **<Name>**: Employee Name → …; Date → ….` (header lines) | `Changed Employee to "…".` / `Changed Date to "2026-10-01".` (the Date is shown as saved, ISO) |
| `Updated the **<Form>** for **<Name>**: List previously received … → added "…".` (Prior Actions on the open Corrective Action) | `Changed List previously received coaching and/or corrective action with date signed to "<the whole list>".` |
| "Updated …" with the leftover note: `I haven't done this part of your message yet: - "…" Send it as its own message and I'll take care of it.` | the diff lines only |

**Guidance lines dropped** (each one appears today only when its case applies):

- `I changed "<from>" → "<to>" in the <paragraph> too, so it matches the form.` The change itself still appears as a `Changed …` line.
- `The <paragraph> still mentions "<value>", which I didn't change automatically because I can't be sure that mention means this line — check that it still says what you mean.`
- `The <paragraph> was written before this change — give it a quick read to make sure it still matches.`
- `I moved the date in the <labels> too, so it matches the form.` The moved text still appears as `Changed …`.
- `The <labels> still names the old date — you wrote that, so I left it; check it still says what you mean.`
- `The Action Plan now states the payroll deduction.` / `The Action Plan no longer states a payroll deduction.` The plan still appears as `Changed Action Plan to "…"`.
- The which-date question (`whichDate`).
- `"<question>" isn't a clear Yes or No, so I cleared the answer rather than keep a Yes on the form. **Is payroll deduct applicable?** Yes or No?`
  **This question is lost.** The reply says only `Cleared Is payroll deduct applicable?.`
- `One more question: **Payroll deduction amount?** Tell me the amount here, or fill it on the form — I won't choose it for you.`
  **This question is lost.** A later turn will not ask it again either, because `payrollAmountPrompt` looks for it in the last reply.
- `The drafted text was written before this change — give it a quick read to make sure it still names the right person.` (header correction)
- `Prior Actions already lists an earlier step, so I left it as it is — change it on the form if that list is wrong.`, and the other Prior Actions notes after "Updated".
- The leftover note: `I haven't done this part of your message yet: …`.

Correction replies with no `formUpdate` and no change are not rewritten. These are:
- the notes-only Prior Actions reply;
- `You have two forms open from that message — … Which one should I change? … Nothing has been changed yet.` This one comes from `which`, which is not in the list anyway.

## 2. policyChange (`src/lib/forms/chat-policy-change.ts`, `policy-rest-of-turn.ts`)

| Today | With the flag |
|---|---|
| `Updated Direct policy from official manual on the **<Form>** for **<Name>**: it now cites **<Section>** from the <manual>, in the manual's own words.` followed by the quoted section | `Changed Direct policy from official manual to "<first 120 characters of the quotation>…".` plus a line for each other field that changed (Type of Offense, Policy Violated, Action Plan) |
| `Removed **<Section>** from Direct policy … It now cites **<Section>**.` | `Changed Direct policy from official manual to "…".` |
| `Removed **<Section>** from Direct policy … That line is now blank — tell me which policy applies and I'll add it from the manual. … Everything else on the form is as it was.` | `Cleared Direct policy from official manual.` and any other changed lines |
| POLICY_CHANGE_REST_OF_TURN: the policy reply followed by the revision's "Updated …" reply | one diff line per field changed by either |
| POLICY_CHANGE_REST_OF_TURN: the policy reply followed by `**Not on the form yet:** "<rest>". Tell me which part of the form it belongs in, or type it on the card and press **Save changes**.` | the diff lines only. **The "Not on the form yet" line is lost.** |

**Guidance lines dropped:**

- The quoted manual section (`**<Section>:**` followed by `> …` lines). Only the first 120 characters of the saved line remain.
- `This replaces what had been typed into that line by hand: "<before>".`
- `It no longer cites <sections>.`
- `Type of Offense now reads **<labels>**, so it matches the policy cited.` It is still a `Changed …` line, but the line shows option keys, not labels.
- `Policy Violated now names the same section, so the two lines agree.`
- `The Action Plan now says management will review <policies> with <first name>.`
- `The policy line is now checked against the manual, so the form won't ask you to verify it at Finalize. Everything else on the form is as it was — give it a read below.`
- `… The Action Plan no longer names it. Everything else on the form is as it was.` (on removal)

These are not rewritten, because they have no `formUpdate` and nothing changed:
- `… isn't cited on the …, so I haven't changed anything.`
- `… already cites …, word for word from the manual. Nothing needed changing.`
- `I couldn't find a section called "…"` and the suggestions after it.
- `More than one document … claims to be the official policy manual …`
- `I couldn't read the official policy manual just now …`
- `I couldn't save … so it is as it was.`

## 3. redraft (`src/lib/forms/chat-redraft.ts`)

This means only the old cited redraft. It runs for a blank Corrective Action
Form, or when the patch turn returned null. A patch turn is never rewritten
here.

| Today | With the flag |
|---|---|
| `Redrafted the **<Form>** for **<Name>** from what you described.` / `**Direct policy from official manual** now quotes the manual and cites its section and page.` / `Give it a read below before you finalize.` | one `Changed <Label> to "…".` line per field the redraft really changed (Observation, Type of Offense, Policy Violated, Direct policy, Action Plan, …) |
| The same, with `I couldn't match what you described to a section of the policy manual, so the policy line is still yours to confirm against the official manual.` | the diff lines only. **The "still yours to confirm" warning is lost.** |
| A redraft that changed nothing but returned `formUpdate` | `I didn't change anything on the form.` |

**Guidance lines dropped:**

- `**Direct policy from official manual** now quotes the manual and cites its section and page.`
- `I couldn't match what you described to a section of the policy manual, so the policy line is still yours to confirm against the official manual.`
- `Anything else you had already typed on the form is kept as you wrote it.` / `Anything you had already typed on the form is kept as you wrote it.`
- `Give it a read below before you finalize.`

Not rewritten, because it has no `formUpdate`: `I couldn't redraft the …: <error>. It is as it was — you can still complete it below.`
If that failed redraft did change the form anyway, the reply is replaced by the diff.

## 4. sameCopy (`src/lib/forms/same-form-copy.ts`)

| Today | With the flag |
|---|---|
| `Copied <Source>'s <Form> content onto <Target>'s draft, with the name changed. Who, where and when are this draft's own. Check the card reads right for <Target> (pronouns are not changed), then save or finalize.` | one `Changed <Label> to "…".` line per copied field that changed |

**Guidance lines dropped:**

- `Who, where and when are this draft's own.`
- `Check the card reads right for <Target> (pronouns are not changed), then save or finalize.` **The pronoun warning is lost.**
- The source's name (`Copied <Source>'s …`). The reply no longer says where the content came from.

Not rewritten, because they have no `formUpdate` and nothing changed:
- `<Target>'s draft already has <fields>. … Say **yes, replace them** to copy it, or tell me what to change instead.`
- `**<Name>**'s <Form> has no details yet, so there is nothing to copy. …`

## 5. revision (`chat-revision.ts`, `form-content-turn.ts`, `open-draft-turn.ts`)

`revision` is the plain-words revision, or else the open-draft turn. Both go
through `reviseActiveForm`.

| Today | With the flag |
|---|---|
| `Updated the **<Form>** for **<Name>**: <Labels>. Removed <Labels>. Everything else on the form is as it was.` / `Give it a read below before you finalize.` | `Changed <Label> to "…".` / `Cleared <Label>.` per saved change |
| An "Updated …" reply whose `formUpdate` names keys the save did not really change | `I didn't change anything on the form.`, with no `formUpdate` |
| A follow-up-date reply with `formUpdate` (`follow_up_date`): `<date lines>` / `Nothing else on the form was changed.` | `Changed Follow-up date to "…".`, or `I didn't change anything on the form.` if the date did not move |
| A finalized form revised into a new draft (`formUpdate` names the new draft, not the open one) | **not rewritten**: the instance differs from the snapshot |

**Guidance lines dropped:**

- `Everything else on the form is as it was.`
- `Give it a read below before you finalize.`
- `<Labels> stays blank until you've done the follow-up — tell me what you saw then, and I'll add it.` (follow-up findings) **lost**
- `I didn't tick a termination, demotion or suspension — that decision stays with leadership.` **The refusal notice is lost.**
- The policy notes after "Updated" (`policyNotes`).
- The follow-up-date lines, including `I didn't change the follow-up date. Use the Follow-up date control on the form.` This is lost only when a `formUpdate` was returned.

Not rewritten, because they have no `formUpdate` and nothing changed:
- `I haven't changed the **<Form>** for **<Name>** — everything on it is as it was.` / `Tell me which part to change and what it should say, and I'll update just that.`
- `The **<Form>** … is finalized, so I haven't changed it. …`
- `**Nothing on the form has changed yet.** I couldn't add that to the Details of Coaching …` (`notWrittenReply`)
- `**Nothing on the form has changed yet.** I couldn't place that on the open … ` (`openDraftTurn`)

---

## Guidance a QA decision is needed on

Five lines carry something the manager must act on, and are lost:

| Path | Line lost |
|---|---|
| correction | **Is payroll deduct applicable?** Yes or No? (after an unclear answer) |
| correction | **Payroll deduction amount?** (asked once) |
| policyChange | **Not on the form yet:** "…" (rest of the turn not placed) |
| redraft | the policy line is still yours to confirm against the official manual |
| sameCopy / revision | the pronoun warning; the termination/demotion refusal notice; the follow-up findings note |

A possible follow-up, not in this PR: keep a path's question lines (those
ending in "?") under the diff lines. That needs QA's approval because it
changes what the flag does.

---

## Draft mode and the payroll Yes/No (QA, 3 Nov 2026)

In draft mode, the payroll Yes/No checkbox (`payroll_deduct`) is checked only
against the group's options (`yes`, `no`, one of them). It is **not** checked
against the manager's words.

The reducer's verbatim check for manager-stated keys skips checkbox groups
(`!group` in `form-reducer.ts`). `reduceDraftWrite` also does not pass the
payroll keys as `managerStated`. `payroll_deduct` is a manager-responsibility
group, so it is not one of the reducer's writable keys in a draft. Whatever
the draft route decided for it passes through unchanged:

- the card's answer, written by `applyStatedFacts`;
- `statedPayrollDeduct`;
- `enforceResponsibilities` at the write.

What does hold in draft mode:

- the amount (`payroll_deduct_amount`, a text key) is written only from the
  manager's own words, by the route's existing `payrollAmountForDraft` and
  `applyStatedFacts`;
- a date key is written only if `datesInText` finds that date in the manager's
  words (`sources.manager`, the notes).
