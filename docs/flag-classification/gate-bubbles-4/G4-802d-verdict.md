# Gate-Bubbles-4: #802 OUTLINE_ON_OPEN_PROPOSAL_ENABLED round 3, head 26fbb76d (Coding-6): GO
- Base main 2593987 (335 production flags). Conflict in chat-quality-flags.ts: kept both (verifyfns 0). tsc clean. 1 OFF + 1 ON.
- 14000 tests (OFF 761 failing, ON 764). Changed 4: INTENDED 2, INTENDED-HARNESS 2, REGRESSION 0. The rounds 1-2 heads (7bfbae15, 2d481537) are superseded and not reported.
- nov11-17i-outline-on-open-proposal (OPEN) holds. On turns b and c the card keeps Issue "she was late on 11/3/26" (OFF at c: 10/12/26), Attendance (p.14, "from what you described") and "Management will review the Attendance policy with Ilsa". The note now reads "I've kept **Ilsa Varnholt**'s own details; nothing from the person in the pasted example goes on this card." The round-1 claim to keep the outline as a layout is gone.
- The guards nov12-g4-802-own-account-kept-{labelled-account, this-format, coworker-named, form-labels-pronoun-subject} hold in both arms (production and fix).
- Probe of isOutlineTurn on the merged tree, employee Ilsa Varnholt, invented names:
  - left out: the 17i outline for Corisande Velt; "same outline but with Ilsa's info"
  - kept: "Date: …/What happened: Ilsa …"; "Observation of Offense: Ilsa arrived …"; a witness named ("Bram Okafor saw Ilsa …"); a nickname ("Izzy arrived …"); "Ilsa was late on 11/3/26. Use this format …"
  - kept, conservative: another person's outline whose Observation says "She did not call …". By the "when in doubt, keep" rule it falls back to today's behaviour, so the 17i bug can still occur for that shape. Not a regression.
