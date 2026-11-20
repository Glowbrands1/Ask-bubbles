# 2026-11-20 — chat FORMS ON FILE block: counts by code, archived drafts out (port from Ask Sunny)

**Ported from Ask Sunny** (Glowbrands1/ask-sunny#1182, behind the same flag, `FORMS_ON_FILE_COUNTS_ENABLED`, default
off). QA's f081 found Sunny's model miscounting forms on file (another person's form folded in, a date's count wrong,
totals that did not add up). This app answers forms-on-file questions only from the chat's FORMS ON FILE block, so its
managers get the same. With the flag, the block ends with COUNTS built by `lib/forms/forms-on-file-counts.ts` for the
model to copy; a period is read up to 1000 rows and counted over all of them (up to 100 listed); an archived draft is
left out unless the question says "archived" (finalized forms count archived or not, marked). Sunny's agent-loop half
(#1181) has no counterpart here: this app has no agent loop.
