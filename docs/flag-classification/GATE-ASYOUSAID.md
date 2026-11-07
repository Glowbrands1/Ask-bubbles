# GATE-ASYOUSAID: which tests it changes, and why

AS_YOU_SAID_MANAGER_WORDS alone, on main 30bb67db (frozen by QA, 7 Nov 2026), 3 runs off and 3 on: **clean**. OFF = production-flags.json as merged + CHAT_GLOSSARY; ON = + AS_YOU_SAID_MANAGER_WORDS. The one changed test is the flag's own off-pin; replay replies are byte-identical off and on in all 3 runs.

Written by `node scripts/flag-classify.ts` (3 runs off, 3 on, each a child process with a clean env; on in both: `CHAT_GLOSSARY_ENABLED`). Paths: `src/lib/ai`, `src/lib/forms`, `src/app/api/chat`, `src/app/api/forms`. Classifications are kept in `docs/flag-classification/GATE-ASYOUSAID.classes.json`.

Tests run: 11788. Changed: 1. INTENDED 0, INTENDED-HARNESS 1, REGRESSION 0, FLAKY 0, UNCLASSIFIED 0.

Replay pack, first run, all cases: 98737 ms off, 99972 ms on (stubbed models; 590 records).

| test | off | on | category | twin | reason |
| --- | --- | --- | --- | --- | --- |
| src/lib/forms/as-you-said-manager-words.test.ts :: AS_YOU_SAID_MANAGER_WORDS_ENABLED off: the app's "Policy reference" line reads as the manager naming the Standards of Conduct | passed | failed | INTENDED-HARNESS | itself (the flag's off-pin) | AS_YOU_SAID_MANAGER_WORDS (bisected alone): its own off-pin. |
