# A form on file is a prior action only when it came before the incident (QA's live re-run, 23 Nov 2026, U09)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts` (`finalizedPriorsOnFile`).

Live on 9340334, U09's card for an incident on 11/1 listed ten forms on file dated 11/10–11/17 as Prior actions: every
finalized form on or before today counted. A form on file now counts only when it is dated before the card's incident
date: the date this proposal gives, else that of this person's card proposed earlier this turn or on screen (a
re-proposal often gives none). With no incident date at all, on or before today, as before. Drafts never counted (only
finalized forms are read), which matches find_past_forms (an archived draft is a test draft).

Replay: `nov23-u09-forms-on-file-before-incident-only` (U09's T1–T2, forms on file 10/2, 11/10, 11/17; the control is the
10/2 form, still listed; the stand-in also proposes again with no incident date, as live). Fails on main, passes here.

**Ask Sunny: same gap, port pending.** Sunny's `finalizedPriorsOnFile` reads forms on or before today, with no incident
date bound. This session has read access only; the port goes to the Sunny coder through QA, titled
`Port from Ask Bubbles (<sha>): …`.
