# A close spelling of a person the manager already confirmed is that person, not another Did-you-mean (coder 5's live run, u35a)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts`, find_staff's close-spelling branch. It used to seat a near miss
only when that exact typed spelling had been confirmed. Now, when the staff list's only close candidate is a person the
manager already confirmed in this chat (any spelling, from the question records), and this message is not a "no", that
person is used.

Report: the manager confirmed the person at T4 ("fix her last name vargas", with no card yet). Then T6 "… liesl moerno
vargas" and T8 "Liesl Loreno Vargas" each got the full "Did you mean **<P>**?" again.

**Ask Sunny: same gap, port pending.** Sunny's find_staff close-spelling branch has no confirmed-person check either.
It also still decides "the person on this chat's card" from reply text, which Bubbles replaced with the card record in
U35(a). The port is held until this passes QA's live run. It goes to the Sunny coder through QA, titled
`Port from Ask Bubbles (<sha>): …`.
