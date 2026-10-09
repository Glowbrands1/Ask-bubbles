# Vercel environment — Ask Bubbles

Derived from `.env.example` and every `process.env` read in `src/`,
`next.config.ts` and `scripts/`. Use **Ask Bubbles** values only
(Supabase project `dyurgwieyltnhphihwwj`). Never paste a value from Ask Sunny.

## Project settings

- Framework Preset: **Next.js** (also pinned by `"framework": "nextjs"` in `vercel.json`)
- Output Directory: **no override** (Next.js default). Not `public`.
- Build Command / Install Command: defaults (`next build`, `npm install`)
- Root Directory: repository root
- "Automatically expose System Environment Variables": **on** — the app reads
  `NEXT_PUBLIC_VERCEL_ENV` to force live mode on Production.

## 1. Needed at build time (compiled into the browser bundle)

`NEXT_PUBLIC_*` values are inlined when the build runs, so they must exist
**before** the deployment is built. Without them the build still succeeds, but
the deployed site cannot sign anyone in.

| Variable | Purpose | Visibility | Environments | Where to get it |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Ask Bubbles Supabase API URL | public | Production, Preview | `https://dyurgwieyltnhphihwwj.supabase.co` (Supabase → Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser key, used for sign-in only | public | Production, Preview | Supabase → Project Settings → API Keys → **Publishable key** (`sb_publishable_…`), not the legacy anon key |

## 2. Needed at runtime (server only)

| Variable | Purpose | Visibility | Environments | Where to get it |
|---|---|---|---|---|
| `SUPABASE_SECRET_KEY` | All server reads/writes, admin user management, embeddings | **secret** (Sensitive) | Production, Preview | Supabase → Project Settings → API Keys → **Secret key** (`sb_secret_…`) for `dyurgwieyltnhphihwwj` |
| `ANTHROPIC_API_KEY` | The assistant. Without it the assistant says it is unavailable | **secret** (Sensitive) | Production, Preview | Anthropic Console → API Keys (a key for Ask Bubbles) |
| `CRON_SECRET` | Authenticates Vercel cron calls; cron routes refuse without it | **secret** (Sensitive) | Production | Generate: at least 24 random characters (e.g. `openssl rand -hex 32`) |
| `NEXT_PUBLIC_SITE_URL` | Origin for invitation and password-reset links. Falls back to the request origin when unset | public | Production (recommended) | The production URL, e.g. `https://ask-bubbles.vercel.app` or a custom domain |

Legacy alternative: `SUPABASE_SERVICE_ROLE_KEY` is read only when
`SUPABASE_SECRET_KEY` is unset. Prefer the secret key.

## 3. Optional / integration-specific (leave unset for now)

| Variable | Purpose | Visibility |
|---|---|---|
| `NEXT_PUBLIC_BUSINESS_TIMEZONE` | Business "today"; default `America/Chicago` (US Central) | public |
| `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT` | Override defaults in `src/lib/config/models.ts` | server |
| `NEXT_PUBLIC_DEMO_MODE` | `true` = labelled demo build. Ignored on Production | public |
| `NEXT_PUBLIC_ALLOW_DEMO_IN_PRODUCTION` | Deliberate override to allow demo on Production | public |
| `REPORTING_INGEST_SECRET`, `REPORTING_MANUAL_INGEST_SECRET` | Report ingestion; no report families exist yet | secret |
| `FORMS_TEMPLATE_SYNC_ENABLED` | Local-only forms registry sync | server |
| `ASK_BUBBLES_EXCLUDED_EMPLOYEE_NAMES` | Hide test records from the employee picker | server |
| `WOVEN_*` (see `docs/woven.md`) | Woven integrations — **leave unset** until Buff supplies credentials and company identifiers | secret / server |
| `ALLOW_UNAUTHENTICATED_LIVE_ACCESS` | Local development only; inert on Vercel | server |

`ASK_BUBBLES_SITE_URL` is read only by `scripts/bootstrap-admin.mjs`, run
from a terminal — it is not a Vercel variable.

## Supabase Auth settings (not env vars, but required for login)

In Supabase → Authentication → URL Configuration for `dyurgwieyltnhphihwwj`:

- **Site URL**: the production URL.
- **Redirect URLs**: the production URL with `/**`, plus the Preview pattern
  (e.g. `https://ask-bubbles-*-glo-brands.vercel.app/**`).
- Authentication → Email Templates → **Reset password**: use
  `docs/supabase-reset-password-template.html`, which links to
  `/auth/recovery-start`.
