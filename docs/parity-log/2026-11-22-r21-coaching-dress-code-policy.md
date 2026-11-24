# A CA turned Coaching Form cites the dress code its own account describes (round 2's offline replay, R21)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts`. QA's ruling (b), 22 Nov 2026: the 16 Nov rule stands (a
Coaching card never copies another form's heading). The CA's existing dress-code check (`dressCodeFit`: the manual's
own Dress Code headings, and words the account already uses) now runs on a Coaching card too. On a Coaching card it
reads the card's own account as well as the request, so "Create a Coaching Form from this conversation" works. When
the card has no policy, cites Other alone, or cites a heading that isn't a Dress Code heading, it goes back to the model
with the Dress Code heading as the fit. A heading the card's own account fits that way is the card's own, never "copied"
from the CA. No new words in code.

Report: T1 "I have an employee <First> at our Grand Island location who has been out of dress code three shifts …" (a
CA citing Standards of Conduct p.12); T2 "Create a Coaching Form from this conversation." dropped the policy; T3 "Yes"
made it "Other — Dress Code".

**Ask Sunny: their item 9, with Sunny coder 2.** QA passed this ruling to them. Same mechanism if their
`dressCodeFit` is the same.
