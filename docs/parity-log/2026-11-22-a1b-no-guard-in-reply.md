# The reply never describes the tool's guards (QA's live re-run, A1 notes (b))

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts`, `rules-book.ts`. After a Corrective Action card, the Coaching
card's turn replied "the system won't let this Coaching card reuse the Attendance heading cited on the earlier Corrective
Action card…". propose_form left the copied heading off and listed it in `not_on_card` (`policy_not_for_this_card`); the
rules book tells the model to say each `not_on_card` entry in one line, and the only reason that entry has is the guard
itself. It is no longer listed there: `facts.policy_copied` already tells the model to propose again with the heading
that fits this card, and its note now says it is for the model to fix. The rules book's plain-reply line adds: never how
the app checks or refuses something; only what is on the card and what is needed from the manager.

**Ask Sunny: same gap, port pending.** Sunny's propose_form lists `policy_not_for_this_card` in `not_on_card` the same
way, and its rules book has the same "say each in one short line" rule. Sunny keeps prompt fixtures
(`sunny-rules-book.txt`, `sunny-system-rules.txt`) that the rules-book line change re-takes. This session has read access
only to Ask Sunny; the port goes to the Sunny coder through QA.
