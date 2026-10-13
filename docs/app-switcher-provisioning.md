# App Switcher access and direct provisioning (DJ Wade, Colene Schildt)

Scope of this change: the App Switcher link between Ask Sunny and Ask Bubbles
only. It changes **no** role, permission or scope in either app.

## What grants the switcher

`pageShowsAppSwitcher()` (server-side, verified identity only) shows it to:

1. administrators (`admin`, `owner`, `developer`) — unchanged, no flag needed; or
2. a verified, **active** user whose own `app_users.can_switch_apps` is `true`.

The flag is read with the user's own session under RLS (`app_users_select_own`),
fails closed (error, missing column, no row, disabled/invited user → no
switcher), and cannot be changed from a browser: `authenticated` has no write
privilege on `app_users`, and the `app_users_guard_switch_grant` trigger refuses
any change made under a user JWT even if a write policy is added later.

The switcher itself is a plain link to the other app's production URL. Nothing
is handed across (no token, session or account). The destination's own sign-in
and role checks decide what happens on arrival.

## Intended accounts

| Person | Email | Ask Sunny (exists) | Ask Bubbles |
|---|---|---|---|
| DJ Wade | DJ.Wade@glowbrands.com | `regional_manager` | `regional_manager` — **not yet provisioned** |
| Colene Schildt | Colene.Schildt@glowbrands.com | `district_manager` | `district_manager` — **not yet provisioned** |

## Scope: what Ask Bubbles needs (verified)

Authentication and the active profile do **not** need a location roster: a
manager whose area is not on the roster signs in, passes every role check, and
simply resolves to no locations (fail closed). Only the database rule needs an
area: `app_users_scope_area_coherent` requires a non-global profile to name one.

So the minimum legitimate setup is one real area per person. Woven (read-only
check) gives these facts, all currently **unmapped** to the Bubbles roster:

- DJ Wade: one affiliation, "JB & Associates - Corporate" (no store number, no region).
- Colene Schildt: Corporate plus 13 stores in Nebraska (66, 67, 123, 225), South
  Dakota (264, Dawley Farms), KC (219), ND (Fargo, Grand Forks), MO Raymore and
  "JB & A Maintenance". Woven carries **no district names** at all.

Neither person has a district in Woven, and DJ has no region. Nothing here can
be assigned without a decision from Buff City Soap, so the script refuses
placeholders. Options, simplest first:

1. **Add the real Woven regions to the roster, with no stores** and give each
   person a `region` scope on the one you choose. Region ids come from the
   existing `regionIdOf` helper: `reg-kc`, `reg-nebraska`, `reg-south-dakota`.
   Both people then see no location data (identical to a scoped user today)
   until stores are mapped. Edit `COMPANY_REGION_ENTRIES` in
   `src/config/company/locations.ts`, e.g. `{ id: "reg-nebraska", name: "Nebraska" }`.
2. **Populate stores** (`COMPANY_LOCATION_ENTRIES`, ids `loc-<store number>`) and
   give each person `location`/`region` scope over real stores. This is the real
   hierarchy work in `docs/location-reconciliation.md`, and it makes data visible.
3. Global scope — **not offered**; the script refuses it.

## Execution order (nothing below has been run in production)

1. **Merge + deploy** the app code (both PRs). Safe before the migration: the
   flag read fails closed, so nothing changes for anyone.
2. **Ask Sunny database:** apply `supabase/migrations/20261013002000_app_switcher_grant.sql`,
   then run `supabase/ops/app-switcher-grant.sql`. It grants DJ and Colene only
   (matching role + active), then raises and rolls back unless exactly those two
   hold the flag.
3. **Ask Bubbles database:** apply the same migration (schema only; grants nobody).
4. **Roster:** add the area(s) chosen above to `src/config/company/locations.ts`
   and deploy.
5. **Provision in Ask Bubbles** (dry run first; `--apply` only with approval):
   ```
   export NEXT_PUBLIC_SUPABASE_URL=...   SUPABASE_SECRET_KEY=...
   npm run provision:user -- --email DJ.Wade@glowbrands.com --name "DJ Wade" \
     --role regional_manager --scope-level region --area-id <reg- id> --grant-switch
   npm run provision:user -- --email Colene.Schildt@glowbrands.com --name "Colene Schildt" \
     --role district_manager --scope-level region --area-id <reg- id> --grant-switch
   # then, to write: add  --apply --confirm-host <project host>
   ```
   (`--scope-level` is independent of role; Woven has no districts, so a
   District Manager is given a real region or location here.)
   Creates the Auth user (email pre-confirmed, 24-character temporary password,
   shown once on an interactive terminal) and the `active` profile with
   `can_switch_apps = true`, plus an audit row. It stops, changing nothing, if a
   profile or auth user already exists for the address.
   **Failure handling:** if the profile insert fails, the Auth user is deleted
   again. If that delete also fails, the script exits with `cleanup_failed` and
   prints the Auth user id to delete by hand; re-running before then is refused
   as `auth_exists`.
6. **Verify in Ask Bubbles:** run `supabase/ops/app-switcher-grant.sql` — it
   changes nothing there (the script already set the flag) but asserts that
   exactly the two intended non-admin accounts hold it.
7. **Hand over the password out-of-band** (password manager or in person, never
   email or chat). At first sign-in the person goes to `/login`, then changes it
   at `/reset-password`, which works with their existing signed-in session and
   needs no email link. Verified end to end (below).

## Evidence (local only; see the PR for the full list)

Against a disposable local Supabase Auth (GoTrue v2.180) + PostgREST + Postgres
with every migration applied:

- `npm run stack:up`, then `src/lib/admin/direct-provision.local-stack.test.ts`:
  provisioning, sign-in with the temporary password, own-row-only reads under RLS,
  password change by the signed-in user (old password stops working), no
  API path to self-grant/promote/widen, revoked/disabled stop reading a grant,
  **real** cleanup of the Auth user on a failed profile insert, orphan reporting
  when cleanup itself fails, and no duplicates.
- A real browser (Playwright/Chromium) against the running Ask Bubbles app and
  that stack, 50 checks: anonymous users see only the sign-in form; DJ-like and
  Colene-like managers sign in, see the switcher (a plain link to Ask Sunny's own
  URL, nothing appended), are refused `/admin/*`, `/knowledge` management and the
  admin APIs, change their password in the UI, and the temporary one stops
  working; an unrelated DM sees no switcher; an admin sees it and the admin pages.

## Not covered / known

- Not yet tested: the same browser run for Ask Sunny, real clicks through to the
  other production app, and the script run against a real project.
- The signed-in menu has no "Change password" link; `/reset-password` is the
  existing route. Adding a link is a separate UI change.
- Forms Register scoping (company-wide list shown to any `view_form_monitoring`
  holder regardless of scope) is a separate, pre-existing issue and is not
  touched here.
