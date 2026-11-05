# 5 Nov 2026: a Coaching Form gets no sales reading — fix Sunny-only; the case is kept here as a guard

The sibling app's flag classification of CA_SALES_POLICY_ENABLED (priority
replay s11) found a Coaching Form for a cell-phone account citing the
Standards of Conduct after a turn complaining about the app ("… reflected it
as underperformance"). QA's ruling: a Coaching Form does not get the sales
reading. The sibling app fixed it in the card's citation step
(`attachFormTurnSources`), which reads the turns without the sales reading
for any card but the Corrective Action Form.

**Not needed in Ask Bubbles:** that citation step does not exist here, and
the same conversation in this app's words (replay case
`nov5-coaching-cell-phone-no-sales-reading`) cites no Standards of Conduct
on the card or the draft with CA_SALES_POLICY_ENABLED on. The case stays as
a guard.
