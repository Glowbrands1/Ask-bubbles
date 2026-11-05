# ROSTER_NAME_IN_CANDIDATE_ENABLED: which tests it changes, and why

Written by `node scripts/flag-classify.ts` (3 runs off, 3 on, each a child process with a clean env; on in both: `FORM_NAME_FROM_ROSTER_ENABLED`, `CA_SALES_POLICY_ENABLED`, `CHAT_GLOSSARY_ENABLED`). Paths: `src/lib/ai`, `src/lib/forms`, `src/app/api/chat`, `src/app/api/forms`. Classifications are kept in `docs/flag-classification/ROSTER_NAME_IN_CANDIDATE_ENABLED.classes.json`.

Tests run: 11350. Changed: 1. INTENDED 0, INTENDED-HARNESS 1, REGRESSION 0, FLAKY 0, UNCLASSIFIED 0.

Replay pack, first run, all cases: 83228 ms off, 82540 ms on (stubbed models; 333 records).

| test | off | on | category | twin | reason |
| --- | --- | --- | --- | --- | --- |
| src/lib/forms/roster-name-in-candidate.test.ts :: ROSTER_NAME_IN_CANDIDATE_ENABLED: a candidate ending in a roster person's name could be them off: "When Odessa" is shaped like nobody (as before) | passed | failed | INTENDED-HARNESS | itself with the flag off (CI default) | The flag's own off-pin: it checks the behavior with ROSTER_NAME_IN_CANDIDATE_ENABLED off, so it fails when the gate forces the flag on in every child test. It passes with the flag off, the state it pins. |
