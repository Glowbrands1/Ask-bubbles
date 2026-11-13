# Gate-Bubbles-4: #847 APPROVER_TITLE_NOT_EMPLOYEE_ENABLED, head 606db333 (Coding-4): GO (flags-off-parity check pending)
- Base main 6d862bbe (17r, 394 production flags). Conflict in chat-quality-flags.ts: kept both (verifyfns 0). tsc clean.
- OFF = main 6d862bbe baseline (production env). ON = #847's tree, production env + the flag. 1+1. Two container restarts killed the ON run twice; this is the third, complete run.
- 15144 tests (ON). Changed 16: INTENDED 15, INTENDED-HARNESS 1 (pending), REGRESSION 0. Every existing case and test is unchanged from main; the 15 INTENDED rows are #847's new cases and tests, which do not exist on main.
- nov12-r37-dm-approves-not-the-title (OPEN on production) holds. "CA for <A>, probably termination once the DM approves": the card says "Woven has no job title on record for <A>, so I couldn't verify one." and no longer "the one you gave (District Manager)".
- The guard nov12-r37-stated-title-kept holds (both arms). "she is a district manager" keeps "The title on the form is the one you gave (District Manager), not one from Woven."
- Pending, as for #724: flags-off-parity (its own vitest project since #840) fails 3/8 on main under the production env. With #847 its "replay-pack, first half" sub-run also fails. A clean-env run (as CI does) is held by QA's pause.
