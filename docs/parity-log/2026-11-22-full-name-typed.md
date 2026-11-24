# The full name the manager typed, not its first word (QA's Bubbles round 2, R14)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts` (`typedFullNameOf`). Some managers type a one-word name that
nobody on the roster has, and in the same request type that word as the first word of exactly one capitalised full
name ("Test Employee" in "for Team Member, Test Employee."). That card goes back to the model with the full name
(`full_name_typed`), so it is proposed again with it. A full name the manager typed exactly is also never cut down by
`withoutJobTitle` ("Employee" is not a title there). The full name is then taken as typed, with the off-roster line
(QA's c220/c224 rule). The reader works from the manager's own words and capitalisation, not from a word list.

Report (QA's test name): T1 "create a written corrective action for Team Member, Test Employee. Test was assigned to
complete policy acknowledgements in woven by 10-15-26 and failed to meet the deadline. …", T2 "name is Test
Employee". Every reply asked "use Test", and the model passed "Test" seven times without making a card. Replay cases:
`nov22-r14-*`; unit test: `agent-loop/typed-full-name.test.ts`.

**Ask Sunny: same gap, port pending.** Sunny's propose_form has the same `withoutJobTitle(tidyTypedName(…))` and
the same not_on_roster path, so a full name whose last word reads as a title is cut down there too. This session has
read access only to Ask Sunny, so the port goes to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
