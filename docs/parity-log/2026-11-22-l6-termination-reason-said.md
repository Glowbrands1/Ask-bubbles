# A termination's stated reason reaches the card and the saved form when the model writes no account (coder 5's live triage, l6)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts`. `exit_reason` (B6, #1047) also applies to a termination (the
model's exit_type "termination", locked on the termination word). The checks are the same: `answerEvidence` on the
quote, and every word of the reason in the manager's quote. With no account from the model, the checked reason becomes
the termination card's account. Create already saves a termination's account as its Reason line, so the card's
reads_back, the saved reason and the draft all carry it. The rules book says to pass it, and never to offer to add a
reason the model can pass.

Report: "exit form for <P>, terminated for job abandonment, not eligible for rehire" on 1c71e11 made a termination
card with no account in both live runs. Run 1's reply offered "The reason (job abandonment) isn't on the card yet
unless you'd like it added".

**Ask Sunny: same gap, port pending with B6.** Sunny's termination reason also comes only from the model's account
(`loopAccount`), and Sunny has no `exit_reason`. The port goes with the B6 port, after QA's live run, through QA,
titled `Port from Ask Bubbles (<sha>): …`.
