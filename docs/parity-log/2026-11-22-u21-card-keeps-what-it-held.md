# The model knows what the card on screen holds; this person's own card asked for again keeps its level and payroll (U21, QA's live round 3)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/card-lines.ts`, `run.ts`, `rules-book.ts`, `tools.ts`.

QA's live round 3 on 1c71e11, U21 T1–T12. Reproduced on main, 3 of 3 live runs: T12 "previous coaching: …" lost the account
("What happened this time?", no Create), the card's policy and prior actions went null, and T10 "make this for joelle
instead of briony" dropped the Verbal/payroll No that Joelle's T8 card held.

- Cause: since a6f203c the model's history shows an earlier card reply as one "[card shown under this reply: <form>]" line,
  so the model no longer knew what the card held. It proposed the card with only the field it was changing, and
  propose_form rebuilt the card from that call.
- History: the stand-in line also says what the card held, as data (`Observation of Offense = "…"; Prior actions = "…"`),
  from the app's own card lines in that reply. Never a bold card line, never "as you said". A reply that copies the
  bracketed line is caught as the copied app note was, and the line is never shown.
- Rules book: a propose_form call is the whole card. Pass every value the card held, with only the manager's change made.
- propose_form: when the card the manager's words ask for (same_card_evidence) is this person's own, by the server's record,
  it keeps its level and payroll (`ownCardAsked`). Another person's card still copies them only with "the same …" (#1026).

Replay: `nov22-u21-r3-whole-chat-card-keeps-what-it-held` (T1–T12 verbatim). Fails on main (T12 account lost), and fails
with the history change alone (T10 level and payroll dropped); passes here.

**Ask Sunny: same gap, port pending.** Sunny has the same `historyReply` stand-in (a6f203c's port) and the same rebuild from
one call. This session has read access only to Ask Sunny; the port goes to the Sunny coder through QA, titled
`Port from Ask Bubbles (<sha>): …`.
