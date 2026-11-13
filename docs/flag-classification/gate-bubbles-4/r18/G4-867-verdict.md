# G4-867 HEADING_DISTINCTIVE_WORDS_ENABLED (head 3bb6a3bd on main 7d5b7bb2) — GO

Clean merge; tsc 0. 1 OFF + 1 ON, production env (prodenv-7d5b, 403 flags) + flag via FLAG_CLASSIFY_ON.
15282 tests; changed 5: INTENDED 4, INTENDED-HARNESS 1, REGRESSION 0.

- nov13-heading-distinctive-words-retaliation-policy / -retaliaton-policy (replay rows + e2e rows): OPEN -> holds.
  ON: "**Policy:** Retaliation is Prohibited, as you said — the policy manual's section on page 23"; plan reviews that policy.
- flags-off-parity replay-pack first half: harness only (child inherits FLAG_CLASSIFY_ON; the new OPEN cases hold).

Probes (named-policy-section with JBA manual chunks + synthetic headings; CLOSE_SPELLING on):
- retaliation / retaliaton / retaliation policy -> Retaliation is Prohibited (OFF: none).
- emergency situation notification -> Emergency Situation Notification Requirement. "emergency notification" -> none ("situation" still required).
- safe harbor / safe harbor policy / fair labor standard act -> none, OFF and ON. The FLSA heading is NOT affected by this change (its words aren't in the generic set), contrary to the PR's 3-heading count.
- conduct / conduct policy -> none; Standards of Conduct NOT newly cited ("standards" stays required).
- Shared word: "Harassment is Prohibited" + "Harassment Requirement": misspelled "harasment" -> asks "Did you mean A or B? … I won't pick one for you". Exact "harassment" (and exact "retaliation" with a Retaliation Requirement twin) -> no citation, no question (no pick; falls to the not-found line). Not a pick, so uniqueness rule holds; noting the exact-spelling tie doesn't ask.
- "retaliation" with a "Retaliation Reporting is Required" sibling still cites Retaliation is Prohibited (sibling has distinctive words, so unique).

Eval (npm run eval, evals/flags.json "on" set locally to the flag, not committed): 35/35 passed; OFF = baseline; ON breaks none (b12 FAIL(policy) both columns, pre-existing); latency p50 off 115 / on 125 ms.
