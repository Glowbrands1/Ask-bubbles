# Ask Bubbles

The Buff City Soap team assistant: grounded answers from company knowledge,
guided forms created through conversation, reports, and conversation history,
behind role- and location-aware access control.

Ask Bubbles is a **sibling product** to the reference platform it was ported
from. It shares that platform's architecture and engineering discipline, and
none of its production state: its own repository, Supabase project, Vercel
project, auth users and credentials.

> **Status.** The platform is complete. Buff City Soap's business
> configuration (location roster, forms, reports, Woven mappings, knowledge
> corpus) is deliberately empty or clearly labelled placeholder until Buff
> supplies it. See [What is Buff-specific](#what-is-buff-specific).

---

## Contents

- [Quick start](#quick-start)
- [Architecture](#architecture)
- [What is Buff-specific](#what-is-buff-specific)
- [Access model](#access-model)
- [Assistant](#assistant)
- [Forms](#forms)
- [Knowledge](#knowledge)
- [Reports](#reports)
- [Woven](#woven)
- [Database](#database)
- [Environment](#environment)
- [Quality gates](#quality-gates)
- [Deployment](#deployment)

---

## Quick start

```bash
npm install
cp .env.example .env.local      # fill in only what you have
NEXT_PUBLIC_DEMO_MODE=true npm run dev
```

Demo mode needs no database and no keys. Pick a role on the sign-in page to see
how navigation and permissions change. Everything it shows is labelled demo
content.

Live mode needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
and `SUPABASE_SECRET_KEY` (the **Ask Bubbles** project), plus `ANTHROPIC_API_KEY`
for the assistant. Create the first administrator with
`npm run bootstrap:admin` (see `scripts/bootstrap-admin.mjs`).

## Architecture

| Layer | What it is |
|---|---|
| App | Next.js 16 App Router, React 19, TypeScript, Tailwind 4 |
| Auth | Supabase Auth (email + password, invitations, recovery). The browser uses Supabase **only** for authentication. |
| Data | Supabase Postgres 17 + pgvector. Every business read and write goes through server routes using the secret key; RLS is enabled and forced on every table. |
| Assistant | Anthropic API, called only from the server (`src/lib/ai`). |
| Embeddings | `gte-small` (384 dims) in the Supabase `embed` edge function. |
| Hosting | Vercel (separate `ask-bubbles` project). Crons in `vercel.json`. |

**Platform vs company configuration.** Platform code (`src/lib`, `src/features`,
`src/app`) never names a Buff form, report, location or policy. Everything a
company decides lives in `src/config/company/`:

| File | Owns |
|---|---|
| `brand.ts` | Product, assistant and brand names, wordmark, tagline, location noun ("location" — may become "Makery") |
| `access.ts` | Role labels and the role → permission matrix |
| `locations.ts` | The location / district / region roster (empty until confirmed) |
| `forms/` | The forms registry, categories, layout families, letterhead |
| `reports.ts`, `reports.server.ts` | The report registry and its server-side data loaders (empty) |
| `knowledge.ts` | Knowledge sources and pinned-document roles |
| `assistant.ts` | Assistant purpose, voice and quick questions |
| `woven.ts` | Woven access-preview policy; the pinned knowledge-sync company and its ownership-review rules |
| `features.ts` | Feature flags for each section |
| `analytics.ts`, `job-titles.ts` | Topic vocabulary and job titles |

Colours live in one place: the `--bcs-*` raw palette at the top of
`src/app/globals.css`, which every semantic token points at. The current
values are a **temporary reference** taken from the public Buff City Soap site
(wine, Buff orange, aqua, cream, charcoal) and are not a brand standard.

### Routes

| Path | Screen | Gate |
|---|---|---|
| `/` | Home | `view_overview` |
| `/chat` | Ask Bubbles | `ask_questions` |
| `/history` | Conversation history | `ask_questions` |
| `/knowledge` | Knowledge base | `view_knowledge` (admin console) |
| `/forms/monitoring`, `/forms/templates` | Forms register and templates | `view_form_monitoring`, `manage_form_templates` |
| `/reports`, `/reports/[id]` | Reports | `view_reports` |
| `/admin/*` | Users, analytics, AI usage, integrations, Woven | admin console roles |

Every page is guarded on the server (`requirePagePermission`,
`requireAdminConsolePage`) and every API route through `authorizeRequest`. The
sidebar only hides what a role cannot open; it is not the boundary.

## What is Buff-specific

| Area | State |
|---|---|
| Brand and palette | Provisional, from the public site |
| Location roster | **Empty** — awaiting Buff's Woven structure |
| Forms | One placeholder, *Team Member Check-In (Example)*, labelled "EXAMPLE FORM — not an approved Buff City Soap form" |
| Reports | **None.** The framework is in place; no KPIs are invented |
| Knowledge | No documents. Upload or Woven Team sync |
| Woven | Adapters ready, **off** until credentials are set. Knowledge company pinned to Midwest Soap Makers (`55839F24-…`); downloads off until verified |
| Role matrix | Sensible defaults in `access.ts`, to be confirmed |

## Access model

> **Architecture constraint.** Authentication is provider-agnostic and no
> external identity provider is a foundational dependency. **Ask Bubbles must
> work fully without Microsoft Entra ID, and Entra access may never be
> available** — the assistant, knowledge, forms, reports and automation all
> run with no external provider configured. **Supabase Auth is the default
> choice** for employee login unless another is explicitly chosen; anything
> else, including Entra, is an **optional adapter**. Report ingestion
> authenticates with its own machine credential, `REPORTING_INGEST_SECRET`.

Roles: Team Member, Assistant Manager, Location Manager, District Manager,
Regional Manager, Admin, Owner, Developer. Scope levels: global, region,
district, location.

- A verified Supabase session with **no `app_users` row has no access**.
- `invited` users can only accept their invitation; `disabled` users are
  refused everywhere and their sessions are revoked.
- Scope is resolved on the server from the account, never from the request.
  District and region scopes expand through the configured roster; an unknown
  area resolves to **nothing** (fail closed).
- Database triggers stop a user changing their own role or status, and stop
  the last active administrator from being demoted or disabled.

## Assistant

`POST /api/chat` → `src/lib/ai/server-ask.ts`: authorize → retrieve top-k
chunks for the brand's knowledge scope → build the system prompt from company
config → call the model → build citations **from the retrieved rows** (the
model only chooses `[S#]` markers). When knowledge is unavailable it says so;
it never invents policy. Conversations sync to `chat_conversations` /
`chat_messages`, scoped to the account. Forms can be proposed, drafted and
revised through the conversation for any registry form that opts in.

## Forms

A schema-driven engine (`src/lib/forms`): documents of typed blocks, per-field
responsibility (system / assistant / manager / employee), immutable published
versions, PDF rendering, the register, follow-ups, archive, and the chat
workflow. Forms are declared in `src/config/company/forms/` — add one file per
Buff form, list it in `index.ts`, delete the example. Nothing else names a form.

## Knowledge

Upload (PDF, DOCX, TXT, MD) or Woven Team sync → extract → chunk → embed →
`knowledge_documents` / `knowledge_chunks`, scoped by `knowledgeScopeId`
(`bcs-core`). Versions are kept; retired documents leave retrieval. Pinned
"framework" documents can be required for specific answers via
`PINNED_KNOWLEDGE_ROLES` (empty).

## Reports

A registry (`src/lib/reporting/registry.ts` reading `config/company/reports.ts`),
generic ingestion lineage tables (sources, files, periods, ingestions,
metrics), location-scoped reads, and a chart / KPI / table kit. With no
reports registered, `/reports` shows an honest empty state. Adding a report
family: a registry entry, a server loader, a parser, and a migration for its
fact table.

## Woven

Two adapters, both **observe-only** and **off by default**:

- **Employee directory** (`src/lib/employees/woven`) — read-only copy of
  people, positions and locations; person-reviewed location and position
  mappings; an access preview (`WOVEN_ACCESS_MODE=off|shadow`; there is no
  apply mode).
- **Knowledge** (`src/lib/knowledge-sync/woven/bcs`) — Buff City Soap's Woven
  company (Midwest Soap Makers, pinned by Company ID) into the knowledge base:
  Policies, Handbooks, Procedures, File Library and Communications, with
  publication, audience and ownership rules, a dry-run plan, and a company
  guard that fails the sync unless the session is provably in that company.

See [docs/woven.md](docs/woven.md) for exactly what is needed from Buff.

## Database

`supabase/migrations/` is the Ask Bubbles baseline: no copied production data,
no seed rows except the two private storage buckets. Verify locally against a
throwaway Postgres (requires PostgreSQL 16 + pgvector):

```bash
npm run verify:migrations    # applies every migration, then supabase/tests/rls_checks.sql
```

`rls_checks.sql` proves: RLS enabled and forced on every table; `anon` holds
nothing; `authenticated` holds only its own profile and `accept_invitation()`;
no cross-user reads; no self-elevation of role, scope or status; no-profile,
invited and disabled users behave correctly; the last administrator is
protected; buckets are private; server-only RPCs are not browser-callable.

## Environment

See `.env.example`. Only `NEXT_PUBLIC_*` values reach the browser, and none
are secrets. Server-only modules import `server-only`.

## Quality gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:bundle        # no demo content in a live client bundle
npm run verify:secrets       # builds with canary secrets, proves none reach the client
npm run verify:migrations    # migrations + RLS checks on a local Postgres
```

## Deployment

- Supabase: the **Ask Bubbles** project only. Never point this app at another
  product's project.
- Vercel: a dedicated `ask-bubbles` project linked to this repository. Set
  `CRON_SECRET`; the Woven crons do nothing until Woven is enabled.
- A Vercel Production build is always live (never demo) unless
  `NEXT_PUBLIC_ALLOW_DEMO_IN_PRODUCTION=true`.
