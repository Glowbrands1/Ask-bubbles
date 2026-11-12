# Gate-Bubbles-5: #743 FUTURE_INCIDENT_DATE_ASK_ENABLED: NO-GO (the answer to its question replaces the Issue)

- PR head 8e96db13, merged --no-ff onto main aecb3342, clean, tsc clean.
- 1 OFF + 1 ON, production env (325) +/- the flag; src/lib/ai, src/lib/forms, src/app/api/chat, src/app/api/forms.
- 13781 tests, OFF 759 / ON 761 failing. Changed 73: INTENDED 2, INTENDED-HARNESS 69, REGRESSION 2, FLAKY 0, UNCLASSIFIED 0. Table in G5-743.md.

## What changed
- Open replay cases nov10-future-incident-date-full-{lower,sentence}: turn 1 now holds (card not dated 12/20/2026, the question asked).
- 69 replay records in 35 older cases (nov4-rev7…, nov5/nov6 roster cases, nov7-second-ca…, nov8…): the ONLY line added is the flag's question ("The date you gave, 11/2/2026 [or 10/31/2026], is after today (10/26/2026) …"). Their fixture clock is 10/26/2026 and their stories write 11/2/26 or 10/31/26, which really is after that "today". INTENDED-HARNESS. Note for QA: on a live day after those dates nothing changes; the pack just carries 35 cases whose clocks predate their own dates.
- No non-replay test changes (the PR's own unit tests set the env themselves).

## The REGRESSION (saved replay text, both open cases)
Turn 1: "write up rowan kestrel, written warning, for not attending the monthly meeting on 12-20-26" -> card + the question.
Turn 2: "it was 10-20-26" -> a new card with **Issue: it was 10-20-26**. The account ("not attending the monthly meeting") is no longer the Issue. The card date becomes 2026-10-20, so the case's assertions (date only) pass.
So every manager who answers the flag's own question loses the Issue. This gate did not establish whether the general date-answer path does the same after other date questions. Coding should check, but either way the flag introduces this turn.
Asked of coding: the answer to the future-date question only dates the card (as DATE_ANSWER_APPLIED does), and the Issue stays the account. Add an assertion on the Issue after "it was 10-20-26" to the two cases.
- Open replay cases now holding: none cleanly (the two above hold on their date assertions only).
