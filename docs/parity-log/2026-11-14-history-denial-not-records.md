# HISTORY_DENIAL_NOT_RECORDS: "never been written up" is not a question about forms on file

**Change.** Gate-Bubbles-3's #888 follow-up (QA, 14 Nov 2026): "verbal ca for <A>, she was late on 11/3/26. no payroll
deduct. never been written up" (or "… no prior coaching") got the policy/forms reply and no card, because
`asksOnlyAboutFormsOnFile` read "been written up" / "prior coaching" as a question about forms on file. With the flag, an
on-file cue with a negation just before it denies a history and is no such question.

**Ask Sunny: not needed.** Checked on Ask Sunny main af04c58c with production flags (salon director, invented person):
"… never been written up", "… no prior coaching" and the plain request all make the Corrective Action card. Its
`chat-form-records.ts` has no `ON_FILE_PATTERNS` gate of this shape, so the request's form intent is never set aside.
