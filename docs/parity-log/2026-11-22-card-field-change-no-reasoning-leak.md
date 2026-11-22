# A change to a field the card shows goes on the card; the reply never carries the model's reasoning (QA's Bubbles re-run, A13)

**Fix (Ask Bubbles):**
- `src/lib/ai/agent-loop/reasoning-leak.ts`, wired into the loop's reply checks (`run.ts`): a reply sentence that speaks
  of "the manager" in the third person (the app's own name for the reader in every tool result and note) is the
  model's reasoning; it goes back once, and is left out if it comes back. One term of the app's own vocabulary, no
  phrase list.
- Rules book: with a card on screen not created yet, a change to a field the card shows (Prior actions, account, date)
  is a change to that card (propose_form again, the card's entries kept and the step added); never a forms-on-file
  lookup or a "card or form on file?" question.

Report (names masked): T1 "corrective action", T2 "<P full name>", T3 "<P> did not acknowledge woven policies by the
due date 10/31", T4 "in the previously recieved coaching include that <P full name> signed the jba policy manual on
10-15-26" — not applied; the reply leaked "The manager's request to add this is about the card on screen (the open
draft), not an older form on file." and asked card-or-file.

Seen while building the case, not changed here: a T3 account that itself reads as a stated prior step ("did not
acknowledge … policies") leaves the forms on file off the card's Prior actions (the existing "the manager's own steps
win" rule). Reported to QA.

**Ask Sunny: same gap, port pending.** Sunny's loop has no reply check for third-person reasoning and no rules-book
line for a card-field change. This session reads Ask Sunny only; the port goes to the Sunny coder through QA.
