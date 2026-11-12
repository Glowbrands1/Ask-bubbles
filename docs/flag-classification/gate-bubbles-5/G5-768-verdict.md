# Gate-Bubbles-5: #768 WRITE_UP_LEAD_NOT_ACCOUNT_ENABLED: NO-GO (the Store readback is deleted)

- PR head 402ae888, merged --no-ff onto main aecb3342, clean, tsc clean.
- 1 OFF + 1 ON, production env (325) +/- the flag; src/lib/ai, src/lib/forms, src/app/api/chat, src/app/api/forms.
- 13761 tests, OFF 759 / ON 760 failing. Changed 6 (1 test row + 5 replay records), all REGRESSION against the flag, 0 FLAKY, 0 UNCLASSIFIED (G5-768.md).

## What it fixes
Open case nov10-write-up-observation-167: the Issue is "Cell phone use", not "write up Marnie Holloway for cell phone use". It holds ON, and so do nov10-r17b-late-opening-quote-not-on-time and nov6-reopen-write-up-still-creates ("Not opening the store on time on Tuesday").

## Why NO-GO
`withWriteUpLeadNotAccount` replaces the reply's `**Issue:**` line with /^(\*\*Issue:\*\*[ \t]*)(.*)$/m, which runs to the end of the line. On this app's card the Issue line also carries the other readbacks:
OFF: `**Issue:** write up Marnie Holloway for cell phone use · **Store:** Omaha, NE (West Dodge Rd), from Woven (where Marnie Holloway is assigned) — tell me if that should change`
ON:  `**Issue:** Cell phone use`
The Store readback and its "tell me if that should change" appear nowhere else in the reply. This hits every changed case (5 records, 3 cases). Where the line carries "**Type of warning:** Written Warning, as you said — tell me if that should change" (e.g. the #743 cases), that readback would go too. This gate did not check whether the stored card's location changes (only the reply text is rewritten).
Asked of coding: replace only the Issue segment (up to the first " · "), keep the rest of the line, and assert in the case that the Store readback is still in the reply.
- Open replay case now holding: nov10-write-up-observation-167 (but see above).
- Sibling: ported from Ask Sunny 2d86f90d, branch only per the commit. Check whether Sunny's card puts other readbacks on the Issue line.
