# Sibling app only, for now: a rewritten account's policy reference is written again (MADE_ABOUT_POLICY_LINE_ENABLED)

The sibling app's live round-11 test (9 Nov 2026): a saved Coaching draft's Details ended "Policy reference: Attendance Policy, JBA Policy Manual p.14". After "make it about leaving the front desk unattended on 11/6/26" rewrote Details, the line was gone and no reference to the new account was written. The fix there writes the reference again from the new account ("Policy reference: Standards of Conduct Policy, JBA Policy Manual p.13"). It does this only where the old account carried such a line.

Not needed in this app while POLICY_CITATION_ENABLED is off in production. Off, this app's Coaching drafts never carry a "Policy reference" line, so a rewrite has none to keep or rewrite. Checked through the replay pack on the make-it-about branch (#647): the draft at Create has no line. A Details that is given one by hand loses it on the rewrite, as in the sibling app.

Port this together with CITATION_LINE_KEPT_ON_REVISION (`forms/app-citation-line.ts`, which this app does not have yet) when POLICY_CITATION is turned on here.
