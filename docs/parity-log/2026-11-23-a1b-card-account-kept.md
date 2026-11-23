# A card re-proposed with no account keeps the account on screen (QA's live record, A1(b); coder 5's u35a run 1)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts`, propose_form. The card on screen for this person had an account
(its record's one-way `accountKey`; for someone off the staff list, the card's name or the name this request
corrects). If the model re-proposes the card with no what_happened (a surname correction, a form change), the card
goes back once per turn, to be proposed with that account as the chat shows it, changed only where the manager asked.
Before, the card's Observation was lost on every later turn.

Report: QA's live record on the A1(b) chat. After "Her name is della varnich" the card's account lost a sentence, and
in coder 5's u35a run 1, T6's card lost its Observation. The replay reproduces the second shape (no account passed). The
first, where the model passes a shortened account itself, is the model's wording, not code.

**Ask Sunny: same gap, port pending.** Sunny has the same card records (`accountKey`) and only U21's
same_card_account_missing hand-back for ANOTHER person's card, so a re-propose for the same person with no account
drops it there too. The port is held until this passes QA's live run.
