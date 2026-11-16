# 16 Nov 2026: the Google reviews refresh runs hourly instead of every six hours — Bubbles-only

`vercel.json` schedules `/api/google-reviews/cron` at minute 23 of every hour
(was `23 */6`), so a new review shows within the hour. Bubbles-only for now:
Ask Sunny's Google connection (`src/lib/reviews/gbp`) has its own cron and
settings, and its Google app is not yet published or reconnected, so its
schedule is left alone until it is. Revisit when Ask Sunny's sync is live. No
company wording or data is shared by this change.
