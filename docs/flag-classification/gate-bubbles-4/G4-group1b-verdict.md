# Gate-Bubbles-4: recovery group 1b (Coding-4)

Base: main c6e0b7d (production env = its production-flags.json on + assumedOn, 325 flags). 1 OFF + 1 ON each, the four paths. tsc clean on each merge.

## #671 NO_SELECTION_ON_OPEN_CARD_ENABLED, head 19902772 (conflict in chat-quality-flags.ts: kept both): GO
- 13749 tests. Changed 18: INTENDED 17, INTENDED-HARNESS 1, REGRESSION 0.
- Every replay change is one line. With a card on screen, the trailing "Based on what you've described, I can prepare one of the forms below." is left off. That happens in nov5-r6-policy-kept-across-turns T10, nov5-sf-b6-reply-full-sentence T3, nov6-diffemp-guard-ruled-out-card-on-screen T2, nov8-kept-request-coaching-* T4-T6, nov8-list-policy-on-card-question-still-answered T2, nov8-questions-not-account-coaching-from-conversation, and nov8-take-off-stays-card-question-still-answered. Every case still holds; no other line changes.
- nov5-sf-b6-full-sentence-and-added-detail (OPEN) stays OPEN, as Coding-4 said (the turn-3 detail is #694's part).

## #686 PASTED_REVIEW_NOT_ACCOUNT_ENABLED, head 74b2b157 (clean merge): GO
- 13753 tests. Changed 4: INTENDED 4, REGRESSION 0.
- nov10-twin-sf-s22-pasted-review-never-drafted and nov5-twin-sf-s22-ca-not-coaching (OPEN) hold. The pasted reviewer notes ("Use this to make it: …", "Make this: …") no longer turn the card into "a **Coaching Form** … Who is this form for?". Wynne Sarrow's CA card (Standards of Conduct — MSB, Verbal Warning, store from Woven) is kept, and "It needs to be a CA" / "Its a CA" keep it.
- Seen, but not this PR: the card's Issue reads "must see behaviors for performace this should be for wynne sarrow". It is the same from turn 1, in both arms.
