# Port: with a card on screen, the model is told which card it is (22 Nov 2026)

**Ported from Ask Sunny #1247 (c7027d8, its 266-chat run's case 011).** Mechanism only. Ask Sunny's own entry is
`docs/parity-log/2026-11-22-open-card-named-in-prompt.md` on its branch `claude/open-card-named-in-prompt`. This app had
the same bare line at main 9340334.

With the Corrective Action card on screen, "it should be the policy for staying past shceduled shift" got "Which form do
you want it on, and who is it for?". The system block's open-card line said only "A card is open", never which card.

Now the line names the card's form (`cardOpenForm`: run.ts passes the card record's template name; the record holds no
person's name). It also says a message naming no other form or person is about that card (a policy, level, date or
account for it changes it with propose_form), so the model never asks which form or who. A prompt line, no word list.

Replay: `nov22-agent-loop-open-card-named-cases.ts` (the sibling's 011 wording shape, invented Fenna Prewitt and Thaddea
Kroll, West Dodge). It fails on origin/main (the model is not told which card) and passes after. The reply itself depends
on the model: listed for QA's live batch.
