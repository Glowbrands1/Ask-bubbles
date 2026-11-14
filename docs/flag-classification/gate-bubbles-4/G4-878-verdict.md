# G4-878 verdict: NAMED_POLICIES_ALL_KEPT_ENABLED @332f15e2 — GO

Base: main 2d83917d (merged into head), flag files from #877 (35b062c1). tsc 0.

- 1 OFF + 1 ON: 15543 tests; 791 failing off, 783 on. 18 changed:
  - INTENDED 4: replay nov13-named-policies-all-kept-both and nov14-named-policies-all-kept-reversed-order (OPEN cases hold, test row + replay row each).
  - INTENDED-HARNESS 14: flags-off-parity (replay first half; OPEN cases flip), named-policies-all-kept.test.ts flag-off unit test under forced ON, and 12 revision-5 / warning-level e2e tests that hit vitest's 5000 ms timeout in the OFF full run only (load). Re-run of both files alone: the same 14 baseline failures off and on, none of the 12 among them (878/rerun-timeouts.txt).
  - REGRESSION 0.
- Probes (invented names, 878/probe878c.jsonl): both offenses kept in Type of Offense, PV and Direct policy for "X and Y", reversed order and "as well as"; controls (attendance only, SoC only, "not attendance, standards of conduct", "actually") keep one policy in both arms; two separate sentences keep the last named (not a joined list, by design).
- Known, not NO-GO: plan stays the Attendance plan (MIXED_POLICY_PLAN); card policy line names one policy (POLICY_LINE_COVERS_EVERY_SECTION, out of #878 per QA).
- Eval (878/G4-878-eval.log): 35/35 both columns; b12 baseline fail in both; p50 98 ms off / 106 ms on.
