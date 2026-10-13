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

## Execution order (nothing below has been run in production)

Prerequisite for step 3: a **real** Ask Bubbles area for each person. The roster
(`src/config/company/locations.ts`) is empty, so today there is no valid
district/region id, and the script refuses placeholders and global scope.
Populate the roster (or choose `location` scope with a real `loc-<code>`) first.

1. **Merge + deploy** the app code (both PRs). Safe before the migration: the
   flag read fails closed, so nothing changes for anyone.
2. **Ask Sunny database:** apply `supabase/migrations/20261013002000_app_switcher_grant.sql`,
   then run `supabase/ops/app-switcher-grant.sql`. It grants DJ and Colene only
   (matching role + active), then raises and rolls back unless exactly those two
   hold the flag.
3. **Ask Bubbles database:** apply the same migration (schema only; grants nobody).
4. **Provision in Ask Bubbles** (dry run first; `--apply` only with approval):
   ```
   export NEXT_PUBLIC_SUPABASE_URL=...   SUPABASE_SECRET_KEY=...
   npm run provision:user -- --email DJ.Wade@glowbrands.com --name "DJ Wade" \
     --role regional_manager --scope-level region --area-id <real reg- id> --grant-switch
   npm run provision:user -- --email Colene.Schildt@glowbrands.com --name "Colene Schildt" \
     --role district_manager --scope-level district --area-id <real dist- id> --grant-switch
   # then, to write: add  --apply --confirm-host <project host>
   ```
   Creates the Auth user (email pre-confirmed, 24-character temporary password,
   shown once on an interactive terminal) and the `active` profile with
   `can_switch_apps = true`, an audit row, and rolls the auth user back if the
   profile insert fails. It stops, changing nothing, if a profile or auth user
   already exists for the address.
5. **Verify in Ask Bubbles:** run `supabase/ops/app-switcher-grant.sql` — in
   Bubbles it changes nothing (the script already set the flag) but asserts that
   exactly the two intended non-admin accounts hold it.
6. **Hand over the password out-of-band.** At first sign-in the person goes to
   `/login`, then changes it at `/reset-password` (that page works with an
   existing signed-in session). Use a password manager, not email or chat.

## Not covered / known

- The signed-in menu has no "Change password" link; `/reset-password` is the
  existing route. Adding a link is a separate UI change.
- Forms Register scoping (company-wide list shown to any `view_form_monitoring`
  holder regardless of scope) is a separate, pre-existing issue and is not
  touched here.
