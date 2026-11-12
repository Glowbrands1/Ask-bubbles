# R6G: which tests they change, and why

Written by `node scripts/flag-classify.ts` (3 runs off, 3 on, each a child process with a clean env; on in both: `CHAT_GLOSSARY_ENABLED`; on together with NOSUCH_FLAG_ENABLED in the on runs only: `--with`). Paths: `src/lib/ai`, `src/lib/forms`, `src/app/api/chat`, `src/app/api/forms`. Classifications are kept in `docs/flag-classification/R6G.classes.json`.

Tests run: 13027. Changed: 0. INTENDED 0, INTENDED-HARNESS 0, REGRESSION 0, FLAKY 0, UNCLASSIFIED 0.

Replay pack, first run, all cases: 416595 ms off, 418424 ms on (stubbed models; 1128 records).

| test | off | on | category | twin | reason |
| --- | --- | --- | --- | --- | --- |
