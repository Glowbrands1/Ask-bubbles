# 2026-11-20 — every flag the code reads is in production-flags.json

**Not ported to Ask Sunny in this change (QA scoped the task to Ask Bubbles); Sunny has the same gap.** QA's audit (P3):
the flag-file test only checked that each listed flag is read by the code, never the reverse, so flags the code reads
but the file never listed ran OFF in the replay pack whatever production had. This app now lists the 43 it was missing
under 'unknown' (no value guessed; QA reads each in Vercel) and a test fails on any new unlisted flag. Sunny's main
(read 20 Nov 2026) reads 452 *_ENABLED flags in production code and lists 39 of them nowhere: the same check and an
'unknown' list there need Sunny's own Vercel reading, QA's call.
