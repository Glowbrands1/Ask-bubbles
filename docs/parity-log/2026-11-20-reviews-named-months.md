# 2026-11-20 — Google reviews in chat: any named month or period reads the month-by-month figures

**Ported from Ask Sunny (31452981, #1151).** Sunny's entry ruled this not needed when it was checked at 7c92054, before
this app's #969 added the month-by-month figures; since #969 the gap was here too: "last month", "in October" and "last 2
months" matched nothing in `MONTHS_PERIOD`, so only this month to date was given. The regex is Sunny's, unchanged (it
names no company content). The L10 assistant's `read_reviews` uses the same `asksForMonthlyPeriods`, so it reads the
months for these questions too. Sunny's loop half (`read_reviews` in its agent loop) does not apply: no agent loop here.
