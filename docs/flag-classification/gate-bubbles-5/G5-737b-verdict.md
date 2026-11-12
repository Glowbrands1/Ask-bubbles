# Gate-Bubbles-5: #737 EXPECTATION_POLICY_LINE_KEPT_ENABLED re-gate, head 7ad39d8b: GO

- New head 7ad39d8b (Coding-2, fixing record 2f2b8517), merged --no-ff onto main aecb3342, clean, tsc clean.
- 1 OFF + 1 ON, production env (325) +/- the flag; same paths.
- 13757 tests, OFF 759 / ON 763 failing. Changed 6: INTENDED 5, INTENDED-HARNESS 1, REGRESSION 0, FLAKY 0, UNCLASSIFIED 0 (G5-737b.md).
- The f4fb7129 REGRESSION is gone: account-only-policy-query-e2e "the drafted Observed says no opening nobody wrote" passes ON, and the new "EXPECTATION_POLICY_LINE_KEPT on: the same turns still save no opening nobody wrote" passes. New unit cases (a general opening line goes; a general "scheduled to work" line stays) pass. New replay nov12-expectation-policy-line-no-invented-opening holds in the production and fix arms.
- QA's check: both PRODUCTION DEFECT it.fails rows in form-edit-noop-guard-e2e turn to holding ON.
- Open replay case now holding: nov10-expectation-policy-line-kept.
- Release note: the two it.fails rows in form-edit-noop-guard-e2e.test.ts and nov10-expectation-policy-line-kept (FIXED_IN_PRODUCTION) need flipping in the release head when the flag goes into production-flags.json.
- Sibling: Coding-2 reports the port on ask-sunny branch claude/expectation-policy-line-kept 323f8a48 (not gated here).
