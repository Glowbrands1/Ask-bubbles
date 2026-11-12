# Gate-Bubbles-4: recovery group 1a (Coding-4)

Base: main 1471dab3 (production env = its production-flags.json on + assumedOn, 322 flags). 1 OFF + 1 ON each, the four paths. Every merge clean, tsc clean.

## #692 DETAILS_FROM_EARLIER_ANSWER_ENABLED, head 6720a3ce: NO-GO
- 13715 tests. Changed 5: INTENDED 2, INTENDED-HARNESS 1, REGRESSION 2 (the guard case, both arms).
- INTENDED: nov10-chat-edits-a-details-handed-to-the-revision (OPEN) holds: the revision is handed the coaching details discussed before the card.
- REGRESSION: nov7-refusal-bub-didnt-edit (fix arm and production arm; the case still passes because it checks only the final Details), T5 "can you upate the draft with these details of coaching?":
  - OFF: "I haven't changed the **Coaching Form** for **Oswin Marchbank** — everything on it is as it was. Tell me which part to change and what it should say, and I'll update just that."
  - ON: "A grounded answer from the policy manual." (the pack's free-chat stub)
  - Why: with the flag on, referredAnswer = earlierContentAnswer skips every app reply ("I haven't changed …", "Here is what I would put on", "Is this for **"). None is left, so formContentQuestion returns null and the edit request goes to the free chat model. That is the path of the live 30 Oct report this case pins ("Updating the draft now", nothing written).
  - Ask: when earlierContentAnswer finds nothing, keep the flag-off behaviour (previousAnswer / the honest not-written reply). Add a unit test for "these details" with only app replies before it, and assert T5's reply in bub-didnt-edit.

## #694 ADDED_DETAIL_KEPT_ENABLED, head c285b314: GO
- 13717 tests. Changed 5: INTENDED 4, INTENDED-HARNESS 1, REGRESSION 0.
- nov10-sf-b6-card-carries-added-detail and nov5-sf-b6-full-sentence-and-added-detail (OPEN) hold. After "Create a Corrective Action Form from this conversation." the card adds "**Also on the draft:** <the manager's turn-3 complaint, verbatim>". Nothing else in the replies changed.

## #689 CA_PROCEDURE_BASIS_ENABLED, head 136e203d: GO
- 13718 tests. Changed 6: INTENDED 2, INTENDED-HARNESS 4, REGRESSION 0.
- nov5-sf-b6-policy-left-for-the-manager (OPEN) holds: Policy Violated / Direct policy are no longer AI-filled after the reply said it would leave that field for the manager. Replies unchanged. The guard nov5-sf-b6-control-rude-to-a-guest is unchanged (holds in both arms).
- INTENDED-HARNESS: ca-cleaning-other (2), ca-conduct-reason "off: nothing changes" and ca-procedure-basis "off" pin CA_SALES_POLICY off or this flag off. withoutUnreasonedConduct now runs under either flag, which is #689's design. CA_SALES is on in production, so production does not change. Coding should know that these "CA_SALES off" tests now fail whenever CA_PROCEDURE_BASIS is on.
