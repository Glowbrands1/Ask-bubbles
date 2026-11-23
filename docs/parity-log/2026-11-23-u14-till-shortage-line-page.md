# A till shortage cites the manual's Register / Bank shortages line (QA's Bubbles round 2, U14; board f136)

**Root cause (Ask Bubbles):** "Can you make a Corrective action for <P> for till shortage. she accidentally gave a guest
$20 in change when it was supposed to be $10" got "Standards of Conduct Policy, JBA Policy Manual p.12" on the card and
the saved form. The manual lists the incident on its own Standards of Conduct line ("Register / Bank shortages", printed
p.13), and A4 (21 Nov) made the loop card cite that line's page, but only when the card's own account names the
incident. Here the account said what she did ("gave a guest $20 in change …"); only the manager's words named it ("for
till shortage").

**Fix (`agent-loop/tools.ts`, the card's `citedPage`):** the account is read first; when it names no Standards of
Conduct line, the manager's own words for this request are read by the same reader (`withConductLinePage`). The policy
stays the Standards of Conduct (the section ruling for a short drawer); only the page follows the line Create quotes.

**Tests:** replay case `nov23-r2-u14-till-shortage-cites-register-line-page` (the tester's turn verbatim, the production
manual) fails before (p.12) and passes after; A4's `nov21-agent-loop-register-shortage-policy-page-agrees` and
`nov21-agent-loop-heading-incident-keeps-heading-page` (a heading incident keeps the heading's page) still pass.

**Ask Sunny: the A4 fix itself is not there.** Sunny main daa2b3c's loop card never reads the conduct line
(`withConductLinePage` is only in its draft route and older chat path), so its card cites the heading's page while Create
quotes the line's. Port A4 (Bubbles `citedPage`) and this fallback together, through QA.
