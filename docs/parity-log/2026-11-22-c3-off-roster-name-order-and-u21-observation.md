# An off-roster "<Last>, <First>" gets its card in either name order (C3); prior steps leave the Observation as sentences too (U21)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts`.

- C3 (QA's live round 3 on 1c71e11): when the model passed "<First> <Last>" for the manager's "<Last>, <First>",
  propose_form's as-typed checks missed it, while find_staff's code said "propose it as typed". The model went round
  until it said the form wasn't built. Live: 1 card in 4 runs on 3d021bb, 4 in 6 on 1c71e11, so no merge from that night
  caused it. Two changes. The general one, at QA's request: a name find_staff takes as typed (not_on_roster, nothing to
  ask) is taken as typed by propose_form on the same call, in whatever word order (`lookUpForCard`'s `asTyped`), so the
  two never disagree. The specific one: `asManagerCommaWrote` reads "<First> <Last>" in the manager's own order before
  the checks, and `lastCommaFirst` shows it as "<First> <Last>". Replay: `nov22-c3-off-roster-last-comma-first-gets-card`
  (admin and store login), `nov22-c3-same-request-twice-never-loops`.
- U21 (round 3): the model wrote the prior coaching and T4's policy acknowledgement into the account as whole sentences.
  #1045's lock removed only a parenthesis. `accountWithoutPriorSteps` (both the parenthesis and the sentence): a sentence
  whose every date is a kept or stated prior step's, sharing a content word with that step (`sharesContentWord`: case and
  simple endings ignored) and holding no date of this incident, leaves the account. A stated "<step> — <date>" the model's list
  dropped is added back. Replay: `nov22-u21-r3-prior-steps-leave-observation`.

The U21 form-date case (`nov22-u21-r3-form-date-never-a-prior-step-date`) is open: coder 1's PR 2 owns that fix.

**Ask Sunny: same C3 gap, port pending.** Sunny has `lastCommaFirst`, `typedInThisRequest` and `fullNameTakenAsTyped`
as here, and find_staff's same "Propose the card now … as typed" note, so the same loop happens when the model
reorders the name. **U21 needs the U09 port first:** Sunny has neither #1045's account lock nor
`priorActionsWithStatedTopics`. The U21 change extends both, so it goes with that port. This session has read access
only to Ask Sunny. The port goes to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
