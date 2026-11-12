# Gate-Bubbles-5: #743 FUTURE_INCIDENT_DATE_ASK_ENABLED re-gate, head 588bf78f: GO (one note on the clock move)

- New head 588bf78f (Coding-2, for G5-743), merged --no-ff onto main aecb3342, clean, tsc clean.
- 1 OFF + 1 ON, production env (325) +/- the flag; same paths.
- 13790 tests, OFF 759 / ON 761 failing. Changed 4: INTENDED 4, REGRESSION 0, FLAKY 0, UNCLASSIFIED 0 (G5-743b.md).
- The G5-743 REGRESSION is fixed. After "it was 10-20-26" the card is dated 2026-10-20, the question is not asked again, and the Issue stays the request: "write up rowan kestrel, written warning, for not attending the monthly meeting on 10-20-26". Note that the Issue's date now reads 10-20-26, the answer's date, where the manager typed 12-20-26. That is the corrected date, not the manager's literal words.
- The 35 older cases: the flag's question appears in none of them (ON vs OFF on this head: no difference).
- Clock-move check: those 35 cases' OFF text on this head was compared with main's OFF text (from the #732 run, main + an inert flag). 65 of 69 records are identical. 4 differ (nov7-second-ca-same-employee-not-a-request-2 and -3, production and fix arms). With the clock at 2026-11-09, 11/3 is now a past date, so turn 2 adds "You mentioned more than one date (11/2, 11/3). Which date goes on the form? …". They still hold. This changes what those two cases exercise (harness only, no product code), and it happens with the flag off.
- Open replay cases now holding: nov10-future-incident-date-full-lower, nov10-future-incident-date-full-sentence.
