# Not needed here: the card's Action Plan names only the card's policy (the sibling app's CARD_POLICY_PLAN_ONLY_ENABLED)

QA's round-6 parity audit (8 Nov 2026). In the sibling app, "put together a corrective action for <A> due to under
performance in … metrics for the month of october" sometimes (a model reading) gave "**Policy:** Standards of Conduct"
but an Action Plan to "review the Standards of Conduct and Evaluations and Raises policies", with a second source
(Evaluations and Raises p.34): a second retrieved section added itself to the model-written plan and the sources.
Its fix, live there since round 5, trims the plan and the citations to the card's Policy line.

Not needed in this app: the Corrective Action card's Action Plan is written by code (`forms/ca-action-plan.ts`,
District Manager feedback of 21 Oct 2026), from the manual sections its Direct policy cites, never from the sections
the answering model retrieved, so a second retrieved section cannot reach the plan. The sibling's guard case (its
pinned manual also holds Evaluations and Raises) passes here with production's flags, main 5f51187e.
