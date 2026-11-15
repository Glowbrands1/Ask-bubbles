## 15 Nov 2026: DM L10 tab in Ask Bubbles' teal; cadence line shows the agenda's total

Ask Bubbles only (the owner, via QA). The DM L10 tab uses Ask Bubbles' own teal instead of the Leadership Hub's gold
and bronze: the accent tokens are re-pointed inside `.hub-l10` in `src/app/globals.css` to existing Buff City Soap
tokens. No component file changes, so ports from Ask Sunny still apply as they are.

Also: the header said "Tuesdays · 90 min" while the BCS DM L10's agenda is 70 minutes (QA's report). Ask Sunny #1033's
`cadenceLabel` mechanism is ported: for the meetings in `CADENCE_FROM_AGENDA` (here `bcs-dm`), the line shows the total
of the agenda the page runs, which the Hub serves. Sunny #1033's STC agenda itself is not copied.

Sibling app: the colour is Bubbles-only by design (each app's own brand). The cadence mechanism is already in Ask Sunny
(#1033).
