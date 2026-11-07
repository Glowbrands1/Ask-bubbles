# This-app-only: an attendance account cites Attendance on the CA card (DESCRIBED_ATTENDANCE_CARD_ENABLED)

QA's finding (g), 7 Nov 2026. With no policy named, "create verbal ca for <name> for opening store late …", "my team member <name> was late on 10-20-26, verbal ca" and an absence got a Corrective Action card with no Policy line here, though the app reads the account as attendance (`describedAttendanceKeys`). Pau approved the lines in `ai/form-proposal.ts` (`namedPolicyFor`, option A: all attendance). With the flag on, the card cites the manual's Attendance section (Late Opening under it) as a reading, never "as you said".

Not ported: the sibling app already gives these cards a Policy line, through its own path. There Late Opening is its own policy, and the app's reading of the account is said by AS_YOU_SAID_APP_READ (its #610). Checked on its main with AS_YOU_SAID and that flag on:
- the three wordings (in its words) say "Policy: Attendance — read from this request" for late and absent;
- "Policy: Late Opening — read from this request" for opening late;
- none says "as you said".
