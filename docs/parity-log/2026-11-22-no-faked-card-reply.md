# A card comes only from propose_form; the app note is never shown (QA's Bubbles live re-run 2, "saved ≠ card")

**Root cause (Ask Bubbles, production f9461c1, read from each reply's `metadata.formProposal` and the loop's trace):** every
saved draft equals the card it was created from; the replies differed. On the turns that stated a fact (U21 "jba woven
policys were acknowledged on 5/26/26", "payroll is not deductable", "verbal warning", "previous coaching: …"; U23's two
examples turns; U35's "can i review the card" and "Create a Corrective Action Form from this conversation."; B6's T6) the
model called no tool (steps `[]`) and wrote the reply in card form, "… as you said". Three of them ended with "[app note:
this reply showed a card built with propose_form]": `run.ts`'s CARD_NOTE, appended to earlier card replies in the model's
history, copied by the model and shown to the manager.
- (1) The history showed earlier card replies in full, with the note: a card reply to imitate without the tool.
- (2) The no-card check compared the reply only with the LAST reply's card; after one faked reply there was none, so
  nothing was checked (U21's T5 and T6), and it never read payroll from the card record.
- (3) The note was never stripped from what the manager sees.

**Fix (`agent-loop/card-lines.ts`, `run.ts`, rules book):**
- the model's history shows an earlier reply without app notes and without card lines; a card reply's card is one "[card
  shown under this reply: <form>, made by propose_form …]" line (the manager's screen is unchanged);
- the rules book: a card comes only from propose_form; never write card lines on a turn without it; a stated fact goes
  to propose_form first;
- on a turn with no card call, the reply is checked against the card still shown (the last reply's, else this chat's
  latest card record, until a form opens), payroll included; a card line (a label of the app's own card, anywhere in the
  line) or a copied app note goes back once and is left out if it comes back;
- "[app note: …]" is stripped from every reply.
Labels are the app's own card labels (a test checks each is one the rules book writes), never the manager's phrasings.

**Live harness (#1008, real model, the tester's exact turns, invented names):** U21 T1–T6 (two-store manager) and U23
T1–T6 (two runs each) did not reproduce the faked reply before or after the fix: the model called propose_form every
turn, and Create saved what the card held (Verbal, payroll No; the examples in Observed). The faking is intermittent in
production, so the replay cases (stand-ins replaying production's exact faked replies) are the regression proof.

**Ask Sunny: same gap, port pending.** Sunny's `run.ts` appends the same CARD_NOTE to card replies in the history,
compares a no-card reply only with the last reply's card (no payroll), and never strips the note. Read-only here; port
through QA.
