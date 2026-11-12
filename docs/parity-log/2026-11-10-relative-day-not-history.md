# Bubbles-only: RELATIVE_DAY_NOT_HISTORY_ENABLED ("…at close yesterday. written warning")

QA (10 Nov 2026): RELATIVE_DATE_READER_ENABLED is live in both apps. Here, "need a CA for <name>. she mishandled cash at
close yesterday. written warning" made a card with no level: this app's rule for a level written as its own last
sentence (`pointsToThePast` in `forms/warning-level.ts`) counted "yesterday" — now a date before today — as an
earlier step. With the flag, a relative day word is the incident's day for that check.

Not needed in the sibling app (checked on its main 80ca35c9): its level reader has no trailing-level rule, and
`statedWarningLevel` gives "written" for this wording with RELATIVE_DATE_READER off and on; its replay case
nov10-relative-day-keeps-written (guard, production's flags) holds.
