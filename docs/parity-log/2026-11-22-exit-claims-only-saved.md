# An exit reply claims only what is saved, on a turn with no card call too (QA's Bubbles live re-run 2, B6)

Builds on U22 (`2026-11-22-exit-reads-back-saved.md`, `agent-loop/exit-read-back.ts`); merge U22 first.

**Root causes (Ask Bubbles, production f9461c1, read from the loop's traces):**
- (a) T6 "she is resigning due to second job I'm ready for the draft" called no tool (steps `[]`) and replied "Noted the
  reason — **Reason for Resignation:** Second job." Nothing reached the card or the saved draft, and no reply check runs
  without a card from this turn. The pack's and the #1008 harness's model both called propose_form there.
- (b) T5 "… eligible for rehire, notice will be attached …" got "aren't fields I can set from here" while Create saved
  eligible_for_rehire = yes. Create's draft runs the exit form's own Details reader (`readExitDetails`) over the
  manager's words, and the card's reads_back never listed what it saves.

**Fix:** reads_back adds the Details reader's lines (How Employee Resigned, Reason for Resignation, the yes/no answers
except payroll, which the card checks itself) under the form's own labels, read from the same manager words. On a turn
with no card call and an exit card on screen, a reply line under one of the form's Details or answer labels (anywhere in
the line) goes back once ("call propose_form, or don't claim it"); still there, it is left out. The card's date lines
are not checked on such a turn. The rules book says every reads_back line is saved at Create. Labels are the form's
own (`exit-library.ts`); no word lists.

**Ask Sunny: same gap, port pending (with U22).** Sunny's propose_form reads `readExitDetails` only for payroll, its exit
card has no read-back list, and its reply check runs only with a card from this turn. Read-only here; port through QA.
