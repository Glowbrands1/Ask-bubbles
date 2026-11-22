# A "Did you mean" for this form starts the request; payroll from any turn of it (QA's Bubbles live re-run 2, U35(ii))

**Root cause (Ask Bubbles; reproduced with the tester's exact turns, stand-in and live):** T2 "i have an employee, <P>
that needs a corrective action form with a customer complaint" got propose_form's own "Did you mean <P>?" (a close
spelling); T3 "verbal warning, no payroll deduct, part-time team member,"; … T11 "Create a Corrective Action Form from
this conversation."; T12 "it was a customer complaint about the experience with <P>". The last card had no level and no
payroll, so the saved draft had no warning_type and no payroll tick.
1. This request's turns start at the turn the app answered with this form's card or its "who is it for?"; the app's
   "Did you mean" for this form did not count, so T3 fell before the start.
2. The walk back from T12 stopped at T11 (a form request naming nobody), so the request "started" there.
3. Payroll could be quoted from the request's FIRST turn only (15 Nov rule), so T3's payroll was refused even at T4.

**Fix (`tools.ts`, `run.ts`, `card-record.ts`):** propose_form's name question records the form it was making
(`templateKey` on the name-question record) and marks that form's request start for the person it offered; a walk that
stops at a form request naming nobody runs from this card's earlier request-start record (card, "who is it for?", or that
name question); payroll may be quoted from any turn of THIS request, as the level (QA's ruling: narrows the 15 Nov rule on
purpose, same person and same incident only). Still refused, each with a replay control: another person's turn, a turn
before the request started, and "make this for <B> instead of <A>" (A's payroll never carries to B); a new incident starts
clean (the existing U35 control).

**Live harness (#1008, real model, the tester's full T1–T12):** before (main): the last card and the saved draft had no
level and no payroll, as assistant manager and as admin/global; after: Verbal and payroll No on the card from T3/T4 on,
and saved, for both.

**Ask Sunny: same gap, port pending.** Sunny's `requestStarts` has no name-question start and its payroll fallback is
`byRequest.turnId === requestStart.id` (first turn only). Read-only here; port through QA (salon for store).
