# Ask Bubbles — initial build handoff

Branch `claude/busy-fermat-izbh1d` on `Glowbrands1/Ask-bubbles`.

## Architecture

**Reused from the reference platform, unchanged in behaviour:** the Next.js
app shell and UX patterns; Supabase Auth (invitations, recovery, session
revocation); server-side authorization (`authorizeRequest`, page guards) and
the role/scope model; the grounded-answer chat pipeline with citations,
conversation history and in-chat form creation/revision; the schema-driven
forms engine (documents, field responsibility, versions, PDF, register,
follow-ups); knowledge ingestion and pgvector retrieval with the `embed`
edge function; the reporting lineage framework and visual kit; both Woven
adapters (observe-only); adoption analytics and feedback; the QA discipline
(tests, bundle guards, migration verification).

**Abstracted** into `src/config/company/`: brand and vocabulary, role labels
and the permission matrix, the location / district / region roster, the forms
registry and categories, the report registry and loaders, knowledge sources
and pinned roles, assistant voice and quick questions, Woven access policy,
feature flags, analytics vocabulary, job titles. Colours are `--bcs-*` tokens
in `src/app/globals.css`. Location ids are text (`loc-<code>`) throughout the
schema and code; there is no locations table and no company-specific join.

**Buff-specific today:** names and copy, the provisional palette and bubble
mark, one clearly labelled placeholder form, empty roster, no reports, no
knowledge documents, Woven off.

## Database

32 migrations in `supabase/migrations`, verified on a throwaway PostgreSQL 16
cluster (`npm run verify:migrations`) together with `supabase/tests/rls_checks.sql`
(anon, cross-user, self-elevation, no-profile / invited / disabled users,
last-admin protection, server-only tables and RPCs, private buckets). The
checks were mutation-tested.

The Ask Bubbles Supabase project (`dyurgwieyltnhphihwwj`) has the first seven
migrations applied and the `embed` edge function deployed (JWT required). The
remaining 25 were not applied: they contain `drop … if exists` statements,
which the connector holds for an interactive confirmation that could not be
given in an unattended session. Security advisors: none. The Ask Sunny
projects were never written to.

## Remaining blockers (need you or Buff City Soap)

1. **Finish the Supabase apply.** Either approve the destructive-statement
   prompts in an attended session, or from a machine with the Supabase CLI:
   `supabase link --project-ref dyurgwieyltnhphihwwj` (check it says *Ask
   Bubbles*), then `supabase db reset --linked` (the database is empty; this
   re-applies every repository migration under its own version) and
   `supabase functions deploy embed`.
2. **Create the Vercel project.** The connected Vercel account was refused
   permission to create projects in the Glo Brands team (HTTP 403). Create
   `ask-bubbles` linked to `Glowbrands1/Ask-bubbles`, or grant the
   connection project-creation rights.
3. **Secrets for Vercel** (Sensitive): `SUPABASE_SECRET_KEY` (Ask Bubbles
   project), `ANTHROPIC_API_KEY` (a Bubbles key), `CRON_SECRET`. Public:
   `NEXT_PUBLIC_SUPABASE_URL=https://dyurgwieyltnhphihwwj.supabase.co`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`.
4. **First administrator:** `node scripts/bootstrap-admin.mjs "Name" email@buffcitysoap.com` with the Bubbles keys and `ASK_BUBBLES_SITE_URL`.
5. **From Buff City Soap:** Woven credentials and company identifiers
   (`docs/woven.md`); the location roster; the real forms; the report
   catalogue and metric definitions; confirmation of the role → permission
   matrix; brand assets; whether "Makery" replaces "location" in copy.
