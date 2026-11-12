# Bubbles mechanism for ACCOUNT_BEFORE_REQUEST_ENABLED (P14(a)); the sibling app has its own (#776)

Pau's P14(a) (QA, 10 Nov 2026): an account given over several turns, then "create a coaching form for <first name>",
then "yes" — the draft saved "No specific incident … was described". The flag has the same name in both apps, with a
different mechanism in each:

- The sibling app (Glowbrands1/ask-sunny#776, coding 6): a turn before the card's first cited turn whose words the
  card's Observation line shows is cited (`ai/account-turn-sources.ts`).
- Here: this app's Coaching card has no Observation line, so the turns themselves are read — the manager turns just
  before the card's first cited turn that recount an incident by this person, read without a leading question, are
  cited (`forms/account-before-request.ts`). The replay shows the gap here only when the account's turn opens with a
  question (this app's card turns leave such turns out).

No port of this mechanism to the sibling app: #776 covers the report there.
