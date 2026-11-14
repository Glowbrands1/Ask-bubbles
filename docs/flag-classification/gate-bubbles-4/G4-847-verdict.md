# G4-847: APPROVER_TITLE_NOT_EMPLOYEE_ENABLED, claude/reland-847 @f7bcb0da (on main 65b7951d, 17z): GO

Run: 1 OFF + 1 ON, production's 419 flags. 15623 tests; 782 failing off, 784 on.
3 changed: INTENDED 2 (the open case nov12-r37-dm-approves-not-the-title holds, as a test row and a replay row), INTENDED-HARNESS 1 (parity). REGRESSION 0. The only reply change in the whole pack: "The title on the form is the one you gave (District Manager)" is dropped for that case.
Eval: 35/35; b12 is the baseline fail, in both columns.

Probes (847/probe847.jsonl; Odalys Pemberley, no Woven title):
- Fixed: "probably termination once the DM approves" (title none); "written warning, waiting on the store manager" (title none; Store Manager off).
- Control kept: "CA for <A>, District Manager, she was late" keeps District Manager. The guard case "she is a district manager" holds.
- Not covered, same in both arms (follow-ups, not regressions):
  - "the district manager signs off on it" still puts District Manager on as her title. The PR's comment names "signs off", but this wording isn't caught.
  - "she is a store manager, …, the DM approves" gives District Manager, not Store Manager, in both arms. The stated title loses to the approver's.
