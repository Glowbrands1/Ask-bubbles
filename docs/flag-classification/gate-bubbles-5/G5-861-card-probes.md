# G5-861: CARD_CHECKED_AGAINST_WORDS probe history (addedFacts / accountFromWords / withCardCheckedAgainstWords)

Gate-only vitest probes run in a separate tree (never in a gate tree), invented people. Heads, in order:
- d42be330: 7 wrong joins ("she gets a verbal warning", key holder x2, store x2, "she maybe forgot", title) → NO-GO.
- 757c3df6: wrong joins out, but 5 real facts dropped (over-block) → NO-GO (QA bar: details stick AND nothing wrong joins).
- 01a4c6cb: anchoring fixed; prior history still joined (5/5) → NO-GO.
- 6a7b0e2e: "was coached on 9/20" still joined → NO-GO. 525b094b: history 11/11 out.
- 45f19342/52b604d6: and/but compounds joined whole (Gate-Sunny-2 class) → split at 52b604d6; comma splice fixed at f95a28b1.
- 4a789296 → 84025c06: time/clock/sequence leads join with the lead kept; leads with a bad clause stay out.
- c2a720f0 (frozen): Issue repair (accountFromWords) never takes history; first account never "Added". BUT unit e2e rows found two more classes: a name+title answer ("Tessa Ormond, General Manager") and a new request line ("jordan testperson needs a written warning for cash handling") joined → NO-GO.
- b302464a: test-only (53 ALL_FLAGS lists); pins CARD off in proposal-path-flags-e2e, so S22 no longer sees CARD — not a fix.
- 92d1f75b: name answers and request lines stay out; near-miss facts still join; everything above unchanged. All probes pass. Full CARD-only and both-flags arms: see G5-861-card-only.md / G5-861-both.md.

Replay "Added to What happened" scan at c2a720f0 (both flags): 5 joins, all correct (17r-c line, "left 10 minutes early that day", two "rude to <coworker>", the sales line); d42be330's 3 prior-history joins gone.
