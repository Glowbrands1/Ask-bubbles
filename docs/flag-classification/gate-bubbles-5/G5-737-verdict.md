# Gate-Bubbles-5: #737 EXPECTATION_POLICY_LINE_KEPT_ENABLED: NO-GO (1 REGRESSION)

- PR head f4fb7129, merged --no-ff onto main aecb3342, clean, tsc clean.
- 1 OFF + 1 ON, production env (325) +/- the flag; src/lib/ai, src/lib/forms, src/app/api/chat, src/app/api/forms.
- 13752 tests, OFF 759 / ON 764 failing. Changed 7: INTENDED 5, INTENDED-HARNESS 1, REGRESSION 1, FLAKY 0, UNCLASSIFIED 0. Table in G5-737.md.

## Asked by QA: the PRODUCTION DEFECT expected-fail tests
Both it.fails rows in form-edit-noop-guard-e2e.test.ts ("a tool append …" and "a tick shows the option's label; two changes are two lines") turn to holding ON (the inner test passes, the wrapper reports failed). Replay nov10-expectation-policy-line-kept (open) holds ON.

## The REGRESSION
account-only-policy-query-e2e.test.ts "the drafted Observed says no opening nobody wrote" (QA live 27 Oct, "nobody said open"): the manager typed only "create a CA form for dale ferris at dodge. she was late on the 2nd" / "yes payroll deduct" / "$25". OFF the saved Observation is "Observed: Dale was late on October 2, 2026." ON it also keeps
"Expectation: An employee assigned to open the location is expected to arrive on time and ready to work at the start of the scheduled shift …"
— the opening story ACCOUNT_ONLY_POLICY_QUERY was built to keep out. Cause: `invented()` returns false for any GENERAL_EXPECTATION sentence before any pattern is checked, so every invented-detail pattern (the opening one too) is skipped, not only "scheduled to".
Asked of coding: exempt a general expectation only from the "scheduled/assigned to" pattern; keep the other patterns (opening, etc.) checked against the notes. Then Marnie's line ("late to open" stated) is kept and Dale's ("late", no opening) is dropped. Add Dale's turns as a flag-on case.
