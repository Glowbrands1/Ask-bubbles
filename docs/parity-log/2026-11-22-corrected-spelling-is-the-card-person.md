# A corrected spelling of the card's own person is that person (QA's Bubbles re-run, A1, blocker)

**Fix (Ask Bubbles):** `cardNameCorrection` in `src/lib/ai/agent-loop/tools.ts` (`closeSpellingOfName`). A full name
whose first and last names are each a close spelling of the open card's person (within two letters and a third of the
longer name) is that person, corrected (name_corrected), also when the message asks for another form. Before, only a
name sharing a first or last name exactly counted, so with CARD_PERSON_THIS_REQUEST on, "Her name is <P2>" after a card
for the misspelling "<P1>" (kept as typed, not on the staff list) was refused as person_change_not_asked; the live turn
then ran into the output cap and timed out, and Create on the old card got 409. No word lists: names are compared by
spelling only.

Report (manager's words, names masked): T1 "My employee <P1> has was 10 minutes late on her last two shifts. … She was
late on 10/5 and 10/15", T2 "I already told you the employee name. She is at Dodge", T3 "Create the coaching form with
the information given. Her name is <P2> and she is at Dodge. She is a makery associate", T4 "she is at Omaha dodge".

**Ask Sunny: same bug, port pending.** Sunny's `cardNameCorrection` has the same exact-name rule
(`sharesAName`, `if (!sharesAName && !answersCardCheck) return null`) and the same CARD_PERSON_THIS_REQUEST guard (on in
Sunny's production). This session has read access only to Ask Sunny; the port goes to the Sunny coder through QA.

**Follow-ups, not in this fix:** a loop timeout with nothing done still throws (the error bubble is not saved); see the
QA thread.
