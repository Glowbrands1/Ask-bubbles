# 16 Nov 2026: the Google Reviews page shows when it was last synced, in Central time — Bubbles-only

The Overview and Leaderboard notes on `/reviews` now say which days "this week"
covers (Monday–Sunday, with dates) and when the reviews were last saved from
Google ("Nov 16, 6:23 AM CT"; the newest store sync that finished, a failed run
does not count). Asked for by Bubbles' administrator. Bubbles-only for now:
Ask Sunny's Google reviews feature is separate (`src/lib/reviews/gbp`, its own
page and sync) and is paused until its Google app is published and reconnected.
Port the mechanism, not the wording, when Ask Sunny's reviews page goes live.
