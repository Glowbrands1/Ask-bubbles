# The resignation reason the manager gives, in any wording, reaches the exit card and the saved form (QA's live round 3, B6)

**Fix (Ask Bubbles):** the loop's propose_form takes `exit_reason` with `exit_reason_evidence` (the manager's words in
this request). On a resignation, the tool keeps the reason only when the quote passes `answerEvidence` and every word
of the reason is in that quote (`src/lib/forms/exit-reason-said.ts`). The card's reads_back then lists it under
"Reason for Resignation". Create checks again that the quote is in the chat's manager turns, then saves it as the
manager's statement. The draft only fills empty lines, so the draft never replaces it. Before this fix, a
resignation's reason came only from the exit form's Details reader (`exit-details.ts` `reasonIn`), a phrase list.
That reader catches "due to second job" but misses wordings such as "she found a better paying job elsewhere", "she
got a second job so she is leaving" and "she said the commute is too long".

Report: T6 "she is resigning due to second job I'm ready for the draft"; the reply and the saved draft had no
Reason for Resignation.

**Ask Sunny: same gap, port pending.** Sunny's loop card has no reason field. Its Create writes the Reason line only
for a termination (from the account). A resignation's reason comes only from the same `reasonIn` phrase reader, so
the wordings above are dropped there too. The port is held until the Bubbles fix passes QA's live run (QA's rule). It
goes to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
