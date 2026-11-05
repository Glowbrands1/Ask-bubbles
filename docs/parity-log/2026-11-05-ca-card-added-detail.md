# 5 Nov 2026: the CA card shows detail added after the request — Bubbles-only (CA_CARD_ADDED_DETAIL_ENABLED)

Pau via QA, sf-b6: after "can you have it include that we recieved a customer
complaint …" (turn 3), "Create a Corrective Action Form from this
conversation." made a card whose Issue was the request's for-clause alone.
Here the proposal's reading context had dropped turn 3, and the card read the
Issue from the request. On, the card shows the manager's later turns that add
to the account ("Details you added") and they are in the draft's source turns
(`src/lib/forms/added-detail.ts`).

**Not needed in Ask Sunny:** its card has no Issue line; its Observation of
Offense already carries turn 3 in the manager's words (the twin case
`nov5-twin-sf-b6-full-sentence-and-added-detail` holds its card assertion
there). The other half of sf-b6, FORM_LEAD_FULL_SENTENCE_ENABLED, is ported
(Ask Sunny 58799a0bff347fb94058450c9001fc6ecb189773).
