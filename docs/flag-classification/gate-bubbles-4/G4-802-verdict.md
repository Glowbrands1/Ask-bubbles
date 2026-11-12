# Gate-Bubbles-4: #802 OUTLINE_ON_OPEN_PROPOSAL_ENABLED: NO-GO

- PR head 3a1b7823 (Coding-6), merged --no-ff onto main 1471dab3 (merge-base c6063f2c), no conflicts, tsc clean.
- Arms: 1 OFF + 1 ON. OFF = the worktree's production-flags.json "on" + "assumedOn" (322 flags) exported as env. ON = the same plus OUTLINE_ON_OPEN_PROPOSAL_ENABLED. Paths: src/lib/ai, src/lib/forms, src/app/api/chat, src/app/api/forms.
- Result: 13719 tests (OFF 759 failing, ON 762 failing; the baseline rows fail in both arms). Changed 4: INTENDED 2, INTENDED-HARNESS 2, REGRESSION 0, FLAKY 0, UNCLASSIFIED 0 (table in G4-802.md).

## What QA asked to check
- nov11-17i-outline-on-open-proposal, production arm: OFF fails at turn c (Issue becomes "late on 10/12/26", the outline's date; Policy "Attendance, as you said"). ON holds: turns b and c keep Issue "she was late on 11/3/26", the Attendance policy (manual p.14) and the store. Fix arm holds in both modes.
- Create after the three turns (fix arm): the drafting model's notes hold "late on 11/3/26" and no "Corisande", "10/12/26" or "did not call the manager"; the saved values hold neither. Holds.
- Open case now holding: nov11-17i-outline-on-open-proposal.

## Why NO-GO: the guard is too broad (found by probe, not in the suite)
`isOutlineTurn` = `looksLikePastedTemplate` (any 2+ "Label:" lines) OR /(same|this|that) (outline|template|format|layout)/, unless the turn asks for a form. It never checks that the outline is about ANOTHER person. With the flag on and no form open (unit probe on the merged tree, invented names):
1. Proposal "create a corrective action for Ilsa Varnholt", then the manager's OWN account in labelled form: "Date: 11/3/26\nWhat happened: Ilsa arrived 40 minutes late and did not call in." -> isOutlineTurn = true; withoutOutlineTurns replaces the question with the earlier request, and notesWithoutOutline drops the turn. The account never reaches the card or the draft, and the reply says "I've kept your outline as the layout … nothing from the person in the outline goes on this card."
2. "Ilsa was late on 11/3/26. Use this format for the action plan." -> isOutlineTurn = true (the words "this format"): the same loss.
Classified REGRESSION against OUTLINE_ON_OPEN_PROPOSAL_ENABLED (silent loss of the manager's account; the suite has no case for it).

Asked of coding: treat a turn as an outline only when it names a person other than the card's employee (or carries no account of the card's person), and treat "same/this outline" as no account only when it adds nothing beyond the name. Add the two probes above, in these words, as unit tests and as a replay case (labelled own account on a proposal keeps its date and events on the card and the draft).

## Wording note (needs a live check)
The note "I've kept your outline as the layout for <A>'s form" makes a claim nothing implements: notesWithoutOutline drops the outline, and the draft's layout comes from the form's own fields. Suggest wording that does not promise to use the outline, or making the claim true.
