# A loop card citing "Care and Cleaning of Equipment and Facilities, p.21" saves it (QA's Bubbles round 2; U06/U09/U15/U17)

**Cause: the app, not the fixture.** QA read production's pinned manual (22 Nov 2026), and the section is there on
p.21. Create read the loop card's heading through `namedPolicies`. Its `NOT_A_NAME` rule takes "of" (and "to",
"with", "by", "about") as a sentence *about* a policy, so "Care and Cleaning of Equipment and Facilities" named
nothing. As a result the saved form had no Policy Violated and no Direct policy, and the Action Plan said "the
applicable company policy".

**Fix (Ask Bubbles):** `app/api/forms/instances/[id]/draft/route.ts`. A loop card's heading is already a heading of
the pinned manual, checked by the tool, so it is looked up as that heading with `manualSectionNamedBy`. Any other
card goes through the old reading, as before. Replay cases `nov22-care-and-cleaning-*` (fail before, pass after)
cover two shapes: the pack's chunk, and the chunk as production holds it, with the heading 105 characters in, after
the previous section's tail. That tail is never quoted.

**Ask Sunny: same gap, port pending.** Sunny's draft route reads `cardHeading` through the same
`namedManualSection({ text: cardPolicyPhrase(body.cardPolicy) … })`, with the same `NOT_A_NAME` rule. Any salon-manual
heading containing "of", "to", "with", "by" or "about" is lost there the same way. This session has read access only to
Ask Sunny, so the port goes to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
