# G4-CH: Bubbles two-offense set (#878 @332f15e2, #899 @cbbf0a8d, #903 @cb951d10) on main 65b7951d (17z): NO-GO

Run: 1 OFF + 1 ON (NAMED_POLICIES_ALL_KEPT + POLICY_LINE_COVERS_EVERY_SECTION + MIXED_POLICY_PLAN), production's 419 flags, 15652 tests; 782 failing off, 793 on.
26 changed: INTENDED 18, INTENDED-ADJACENT 4 (late opening + rude to a coworker now cites both sections), INTENDED-HARNESS 4, REGRESSION 0. This matches Coding-2's pack diffs.
Eval: 35/35; b12 is the baseline fail, in both columns.

Probes (chain/probechain.jsonl; arms OFF / N+L / ALL):
- Pass:
  - named-both, named-reversed, named-ampersand, described-both: offense, PV and Direct policy (both sources) cover both offenses; the card names both; ALL adds "Management will review the Standards of Conduct policy with Nell." after Pau's attendance plan.
  - Single-policy controls (attendance-only, soc-only, described-yell-only, correction) are the same in all three arms. late-sanitation is unchanged.
- FAIL 1, take one policy off a two-policy card. "take the attendance policy off the form" (N+L and ALL):
  - card "**Policy:** none — you took the Attendance policy off";
  - PV blank, Direct policy empty;
  - the saved form still ticks attendance_policy + standards_of_conduct, and the plan keeps the Attendance plan + the SoC line.
  - With the flags off, the same turn keeps Standards of Conduct (offense, PV, card).
  - Same for "take standards of conduct off the form".
- FAIL 2, QA's 17z wording "she was late on 11/3/26 and yelled at a customer, and didn't do the sanitation":
  - the saved form is right (offense attendance + SoC + other; PV all three; Direct policy both; plan with the SoC line);
  - but the card's Policy line names only Attendance ("…from what you described ("late") … The cleaning duty … under Other"), and the card's Action plan has no SoC line, so the card disagrees with the draft.
- Known and non-blocking: three described offenses keep attendance + other only.
