# G4-871 (#871 head e411007060, base main 6081b825; merges clean onto b9720947) — per flag
MADE_ABOUT_EMPTY_PATCH_ANSWERS_SAVED_ENABLED: GO. ADD_ALREADY_ON_FORM_SAYS_SO_ENABLED: GO (after Coding-6's deltas).
- tsc 0. 1 OFF (ca5ae744; delta flag-gated) + 1 ON (both flags, e411007060), prodenv-6081 (404 flags).
  15430 tests, 21 changed: INTENDED 8, INTENDED-HARNESS 13 (12 new delta unit tests absent OFF; parity row), REGRESSION 0.
- Made-about probe: OFF "I haven't changed … everything on it is as it was" with the Observation saved; MADE: "Changed
  Observation of Offense to: …". Revision calls on the turn: OFF 2, ON 1.
- Add probes: already-on -> "already says that"; NOT/wasn't -> revision's own reply (fixed in 2db5eb6daa); new add
  writes; reordered no match; refused made-about (dated/undated) still "I couldn't rewrite …".
- Minor: "add phone use" matches an Expectation line; "of the entire shift" == "for the entire shift".
- Observation (pre-existing, now visible): the made-about reply lists "Changed Action Plan to 'Management will review
  the Attendance policy …'" for a phone-use account; OFF saves the same plan silently.
- Eval (both flags, ca5ae744): 35/35; OFF == baseline; ON breaks none; b12 FAIL(policy) both columns.
