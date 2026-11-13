## 12 Nov 2026: TERMINATION_TIDY_HELD_NAME stays Ask Bubbles only

QA's 17r live note on #829 (TERMINATION_CARD_TIDY, live in 17r): on the off-roster ask path, "CA for <B>, do not
terminate yet, she was late" still gave the held card "Issue: do not terminate yet". The tidy read the account after the
card's employee, and FORM_NAME_FROM_ROSTER had held the name off the card. TERMINATION_TIDY_HELD_NAME_ENABLED reads it
after the name the reply says it could not find.

Not needed in Ask Sunny: its Corrective Action card has no Issue line and no `issue` hedge to tidy (the 17o entry,
`2026-11-12-termination-card-tidy.md`: there the Observation of Offense keeps the whole account). Ask Sunny's main has
no TERMINATION_CARD_TIDY at all; its only part of it, the plan-line break, is S#904, which reads no employee name.
