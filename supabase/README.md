# Supabase — Ask Bubbles

The schema for the **Ask Bubbles** Supabase project, as ordered migrations.
Apply them to that project only.

## Layout

| Area | Migrations | Notes |
|---|---|---|
| Knowledge | `20260829*`, `20260831000600–0800`, `20260915001000`, `20260930002000`, `20261003001000` | Documents, chunks (`vector(384)`), retrieval RPC, private `knowledge-documents` bucket. Server-only. |
| Reporting framework | `20260831000900_reporting_framework.sql` | Sources, files, periods, ingestions, metrics, private `reporting-sources` bucket, ingestion RPCs. No report families. Server-only. |
| Forms engine | `20260904*`, `20260907*` | Templates, versions, instances, values, events, assets, follow-ups. Server-only. |
| Identity | `20260904006000_app_users.sql`, `20260905*`, `20261002001000` | Profiles, audit, invitation acceptance, self-elevation and last-admin guards, session revocation. |
| Analytics and feedback | `20260911001000`, `20260915002000` | Text-free adoption events keyed on `loc-<code>` location ids, assistant feedback, aggregate RPCs. Server-only. |
| Chat history | `20260921002000` | Account-scoped conversations and messages. Server-only. |
| Woven | `20260928*`, `20260929*`, `20260930*`, `20261002002000` | Directory, location/position maps (configured `loc-<code>` ids), knowledge sync, overrides, account links. Observe-only. |

## Posture

- RLS is **enabled and forced** on every table.
- The browser roles hold almost nothing: `authenticated` may read its own
  `app_users` row and execute `accept_invitation()`; `anon` holds nothing.
- Everything else is read and written by server routes with the secret key,
  where permissions and location scope are enforced.
- There is no seed data. Locations are configuration
  (`src/config/company/locations.ts`), not a table.

## Verify locally

```bash
npm run verify:migrations
```

Creates a throwaway PostgreSQL 16 cluster with Supabase's role shape
(`scripts/local-stack/bootstrap.sql`) and auth stand-ins
(`scripts/db/local-auth-stub.sql`), applies every migration in its own
transaction as `postgres`, then runs `supabase/tests/*.sql`.

## Apply to the Ask Bubbles project

```bash
supabase link --project-ref dyurgwieyltnhphihwwj   # Ask Bubbles — check the name before continuing
supabase db push
supabase functions deploy embed
```

Then run the Supabase security and performance advisors.
