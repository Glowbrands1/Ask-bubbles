# Google Reviews

Read-only ingestion of Google reviews for Buff City Soap's **seven** approved Business Profiles, shown to administrators at `/admin/integrations/google-reviews`.

## What it will and will not do

- Reads accounts, locations and reviews through Google's official Business Profile APIs, using OAuth (PKCE, offline access, scope `business.manage`).
- **Never** replies to, edits or deletes a review. Only `GET` requests are made; no route exists for anything else.
- Never ingests Sun Tan City profiles, even though the same Google account holds 15 of them. Brand isolation is structural: an allowlist table of the seven stores, a foreign key from every review to it, a trigger that checks the review's resource name against the linked location, and a matcher that blocks titles containing Sun Tan City.
- Links a store to a Google profile only when **both the store code and the street address match** (or an administrator explicitly confirms the one stored candidate). Woven IDs are never used to infer a Google link.
- Stores no reviewer identity (name, photo, profile URL).

## The seven stores

| Code | City | Address |
|---|---|---|
| 219 | Lee's Summit, MO | 2050 NW Lowenstein Dr, Ste C, 64081 |
| 225 | Sioux Falls, SD | 4025 W 41st St, 57106 |
| 236 | Grand Island, NE | 3429 W 13th St, Ste B, 68803 |
| 264 | Omaha, NE | 7810 West Dodge Rd, 68114 |
| 338 | Sioux Falls, SD | 5902 E 18th St, 57110 |
| 66 | Kearney, NE | 5210 2nd Ave, 68847 |
| 67 | Bellevue, NE | 10110 S 15th St, Ste 104, 68123 |

Google location resource IDs are recorded in `google_review_locations` the first time a sync links them; none are assumed.

## Switches (all default off)

`GOOGLE_REVIEWS_SYNC_ENABLED` (reach Google at all) → `GOOGLE_REVIEWS_WRITES_ENABLED` (a sync may save) → `GOOGLE_REVIEWS_SCHEDULE_ENABLED` (the cron may run). A save also needs `dryRun:false` **and** `confirmSave:true` in the request.

## Go-live checklist (human steps)

1. Apply migration `supabase/migrations/20261013001000_google_reviews.sql` (rollback: `supabase/rollbacks/20261013001000_google_reviews_down.sql`).
2. In Google Cloud, request/confirm access to the Business Profile APIs for the project (a zero-quota 429 means not yet approved; the screen says so), enable the Account Management, Business Information and My Business APIs, and create an OAuth client with the redirect URI shown on the screen.
3. Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` and redeploy.
4. Set `GOOGLE_REVIEWS_SYNC_ENABLED=true`, an administrator clicks **Connect Google account** using the account that manages the Buff City Soap profiles.
5. Click **Check Google (nothing saved)**; confirm 7 of 7 stores link. Confirm any "Needs confirmation" candidate only after comparing the address.
6. Set `GOOGLE_REVIEWS_WRITES_ENABLED=true`, run **Sync and save**, then optionally `GOOGLE_REVIEWS_SCHEDULE_ENABLED=true` (Vercel cron every 6 hours at :23).

## Safety behaviours

- A review Google stops returning is marked removed, not deleted, and only after a *complete* read; a read that returns far fewer reviews than are saved is refused (`removal_guard`).
- Reads are paged, rate-limited, retried with backoff, and idempotent (content-hash upserts).
- The refresh token is sealed with AES-256-GCM; tokens, secrets and review text never appear in logs or run records (codes and counts only).
