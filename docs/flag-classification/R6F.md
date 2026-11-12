# R6F: which tests they change, and why

Written by `node scripts/flag-classify.ts` (3 runs off, 3 on, each a child process with a clean env; on in both: `CHAT_GLOSSARY_ENABLED`; on together with NOSUCH_FLAG_ENABLED in the on runs only: `--with`). Paths: `src/lib/ai`, `src/lib/forms`, `src/app/api/chat`, `src/app/api/forms`. Classifications are kept in `docs/flag-classification/R6F.classes.json`.

Tests run: 13030. Changed: 0. INTENDED 0, INTENDED-HARNESS 0, REGRESSION 0, FLAKY 0, UNCLASSIFIED 0.

Replay pack, first run, all cases: 415228 ms off, 416590 ms on (stubbed models; 1128 records).

| test | off | on | category | twin | reason |
| --- | --- | --- | --- | --- | --- |
