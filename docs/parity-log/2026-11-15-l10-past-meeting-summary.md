## 15 Nov 2026: Past meetings and recaps open each meeting's full summary

Port from Ask Sunny #1040 (`1882cdb`; Hub #93). The owner asked for Bloom Growth's "Summary for <date>": each row on the
DM L10's Past meetings and recaps pages now opens (a native details/summary, read-only) into the full summary: the stats,
FEEDBACK, TO-DOS and ISSUES SOLVED by owner, NOTES and the cascading message. `MeetingSummary.tsx` is the Hub's, shared
with the Conclude page's summary. `past.ts` reads the Bloom import's enrichment (solved issues, to-dos, notes) when it
is there and says "Not recorded" when it is not.

Ask Bubbles differences: solved issues are grouped by `owner ?? ""` (the owner is null here when unknown), and recaps
are read through Ask Bubbles' `solvedIssues` reader. Two Ask Bubbles tests that checked the old flat layout now check
the summary.

Sibling app: already in Ask Sunny (#1040, `1882cdb`); this is its port.
