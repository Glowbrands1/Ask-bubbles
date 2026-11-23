# The saved Policy Violated keeps the card's manual and page, every heading (QA's live re-run A7 / U09; Pau, 23 Nov 2026)

**Root cause (Ask Bubbles):** a Corrective Action citing a heading the form files under another Type of Offense box
(Care and Cleaning and the other company policies `readersLineBox` files under Standards of Conduct; Time Records)
showed the card's line "Standards of Conduct — <heading>, JBA Policy Manual p.<n>", but the saved `policy_violated` was
the readers' "Standards of Conduct — <heading>", without the manual and page.

**Fix (`forms/instances/[id]/draft/route.ts`):** the card's line is the saved Policy Violated for every heading. Pau's
ruling (23 Nov 2026, via QA): "add the page everywhere", Time Records included. This supersedes f071's Time Records line
without the page.

**Ask Sunny: ported** (`claude/port-saved-policy-keeps-page`). Its list names only Time Records, so the change there is
Time Records. Its `nov20-card-policy-line-time-records` test changes its expectation on purpose, with a comment citing
Pau's ruling.

**Tests:** replay cases `nov23-saved-policy-violated-keeps-manual-and-page` (Care and Cleaning) and
`nov23-saved-policy-violated-time-records-keeps-page` (Time Records) fail before and pass after. Control:
`nov23-saved-policy-violated-own-box-control` (Attendance).
