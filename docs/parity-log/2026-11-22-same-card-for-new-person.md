# "Make this for <B> instead of <A>" carries the card's account to <B> (QA's Bubbles round 2, U21)

**Fix (Ask Bubbles):** the loop's propose_form takes `same_card_evidence`: the manager's words in this message asking
for the card on screen, or this chat's latest card of the form by the server's record, for this person. It counts as
asking for a form for this person, so the person guard does not refuse it. With no account from the model, the card
goes back once. The model then proposes it with that card's account as the chat shows it, with this person's name.
The records keep only a one-way key of the account, never its text (QA's c163), so the model restates the account
rather than code copying it. The fact `copied_from_card` says the account was copied, and that a level and a payroll
answer are the manager's to state for this person (copied only on QA's ruling below). The rules book and the tool note say the
same.

Report (QA's round 2 U21, wording kept): T3 "This is what happened: She has recieved coaching on 9/22 for cleaning
tasks not being completed. …", T9 "no i want this to be a corrective action for a new person now", T10 "make this
for <P7> instead of <P6>". In one of two runs the reply was "this new Corrective Action is for <P7>. What happened?";
in the other, <P7>'s card was refused (`person_change_not_asked`). Replay cases: `nov22-u21-*`.

**QA's ruling (22 Nov 2026):** "make the SAME corrective action but for <B>" is the manager's explicit ask. The
earlier card's level and payroll answer (from its server record) are copied too and shown on <B>'s card, and the reply
says so ("Copied Verbal Warning and payroll No from <A>'s card; tell me if <B>'s are different."). Without it, as in
"make this for <B> instead of <A>", another person starts clean. The model says which kind of request it is
(`same_card_evidence.kind`: `same_form` or `this_card_for`); code does not match the word.

**Ask Sunny: same gap, port pending.** Sunny's propose_form has no `same_card_evidence`, and its person guard is the
same code, so "make this for <B> instead of <A>" is refused or loses the account there too. This session has read
access only to Ask Sunny, so the port goes to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
