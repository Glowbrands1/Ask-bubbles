# Woven — Buff City Soap / Midwest Soap Makers only

**Ask Bubbles' Woven integration is a Buff City Soap connector, not a
multi-company one.** The one Woven company it may operate against is pinned in
code, `WOVEN_TENANT` in `src/config/company/woven.ts`:

| | |
|---|---|
| Brand | Buff City Soap |
| Company | Midwest Soap Makers |
| Company ID | `55839F24-9241-418C-8405-37BAF9A42A87` |

The Company ID is the identity. No environment variable, setting, default or
fallback selects a company: variables can only *confirm* the pinned values,
and any other value disables the integration. If Woven cannot be shown to be
in Midwest Soap Makers, the run fails. Ask Bubbles was ported from another
product's platform; that product's connector survives only as test fixtures
under `src/lib/knowledge-sync/woven/reference/`, which no production module
may import (`bcs/tenant-isolation.test.ts` enforces it).

Ask Bubbles has two Woven integrations. Both are **observe-only** and both are
**off** until switched on with environment variables. Nothing in this build
creates, disables, re-roles or re-scopes an Ask Bubbles account from Woven.

## 1. Employee directory (Woven Open API)

Code: `src/lib/employees/woven`. Admin screen: `/admin/integrations/woven`.

What it does when enabled: reads employees, positions and locations; stores a
read-only directory with change history; queues every Woven location and
position for a **person** to map (location → a configured `loc-<code>` id,
position → an Ask Bubbles role and scope level); shows an access preview of
what a future provisioning stage *would* do.

### Needed from Buff City Soap

| Item | Variable | Notes |
|---|---|---|
| Woven API portal subscription key | `WOVEN_SUBSCRIPTION_KEY` | Sensitive |
| Integration account username / password | `WOVEN_USERNAME`, `WOVEN_PASSWORD` | A dedicated read-only account. Sensitive |
| Confirmation of the pinned company | `WOVEN_COMPANY_ID` | Must be `55839F24-9241-418C-8405-37BAF9A42A87`; required for a sync. Any other value turns the integration off. Every sign-in names the pinned company whatever this says, and a token issued for any other company — or naming none — is refused |
| API base URL, if not the default | `WOVEN_API_BASE_URL` | |
| Login-eligible email domains | `WOVEN_LOGIN_EMAIL_DOMAINS` | Unset = nobody is eligible to sign in from Woven data |

### Switching it on, in order

1. Set the credentials and `WOVEN_VALIDATION_ENABLED=true`. Run **Test Woven
   connection** on the Woven screen. It is read-only, signs in to Midwest Soap
   Makers by its Company ID (it fails if Woven issues the token for any other
   company) and reports enum vocabularies, the position and location catalogue
   and how the locations compare with the configured roster.
2. Set `WOVEN_COMPANY_ID=55839F24-9241-418C-8405-37BAF9A42A87`.
3. Fill `src/config/company/locations.ts` with Buff's locations (codes as Woven
   numbers them), districts and regions.
4. `WOVEN_SYNC_ENABLED=true` (dry runs only), then `WOVEN_SYNC_WRITES_ENABLED=true`
   to save, then `WOVEN_SYNC_SCHEDULE_ENABLED=true` for the daily cron.
5. Review the location and position mappings on the Woven screen.
6. Optionally `WOVEN_ACCESS_MODE=shadow` to record the access plan each run.

### Decisions Buff needs to make

- Which Woven positions map to which Ask Bubbles roles
  (`src/config/company/access.ts` labels; mappings are made on screen).
- Which roles a future provisioning stage may create accounts for —
  `src/config/company/woven.ts` (default: Location Manager, Assistant Manager;
  preview only).
- Whether "Makery" replaces "location" in copy (`src/config/company/brand.ts`).

## 2. Knowledge (Woven Team web app) — Buff City Soap connector

Code: `src/lib/knowledge-sync/woven/bcs` (the Buff City Soap connector) on the
shared engine in `src/lib/knowledge-sync`. Admin screen:
`/admin/integrations/woven-knowledge`. Contract:
`src/lib/knowledge-sync/woven/bcs/contract.ts`, copied from the verified
browser handoff of 6 October 2026 (`woven-buff-city-soap-ask-bubbles-handoff.json`).

```
Woven session (sign-in; account chosen BY COMPANY ID)
      ↓
company guard — /Company must show 55839F24-9241-418C-8405-37BAF9A42A87
      ↓
adapters: Policies · Handbooks · Procedures · File Library · Communications
      ↓
publication / audience / ownership rules (reconcile)
      ↓
normalise → SHA-256 change detection → manifest (knowledge_sync_items)
      ↓
Ask Bubbles' own pipeline: Storage → extract → chunk → embed → retrieval
```

**Read-only against Woven.** Only the verified list/detail reads and the
sign-in are sent. Courses and Knowledge Elements do not exist in this company
and are never requested. These are Woven's internal web-app routes, not an
official API; the connector sits behind `KnowledgeSourceConnector`, so an
official API can replace it later without touching the engine.

### The company guard

Woven's content requests carry no company id — the company is server-side
session state — and the integration login can open other Woven companies.
So, on every run:

1. The session is established (sign-in, profile-photo prompt skipped).
2. On the account chooser, the entry is chosen **by its `data-company-id`** —
   the pinned Company ID — and its visible name must be "Midwest Soap Makers".
   No other entry is ever chosen; if it is not offered, the run fails.
3. `GET /Company` must carry exactly the pinned Company ID — every reading of
   it, none other — and name "Midwest Soap Makers" where the active company is
   named. A missing, different or second id fails the run before anything is
   read. Verified by a read-only live diagnostic (6 October 2026): the page
   ("Account Management") does not show the id as text; the session's company
   is in the page's inline scripts under `companyid`, `wovenCompanyID` and
   `companyId`, and the name is in the account menu. Those script keys are
   read (whole identifiers only); `data-company-id` attributes (the Switch
   Account list) never are.
4. After every automatic re-sign-in, step 3 again.
5. After every listing, before anything is classified, saved or applied,
   step 3 again. Any mismatch aborts the run with nothing written.

The integration login must therefore be able to open the Company page.

### What is synced, and what is not

| Source | Verified for BCS | What happens |
|---|---|---|
| Policies (12) | list + detail structure | **Inventory only.** Publication state is unverified, so every policy is excluded as `publication_unverified`. |
| Handbooks (1) | list | **Inventory only.** No handbook content/download route is verified for this company, so the part is BLOCKED. The one handbook is a JBA-titled manual → held for ownership review. |
| Procedures (51) | one empty-category search (category counts + every card), badges, positions, detail steps | One request lists everything: the cards must number exactly the sum of the 12 category counts, or the listing fails (a search naming a category answers nothing, so it is not used). Drafts (`Unpublished`) excluded; their pages are never fetched. Step text is ingested once the "All Positions" audience is shared by an administrator. Step attachments are not read (unverified). |
| File Library (264) | list, columns, status keys, audience forms | Unpublished excluded. Columns proved on every row (schema drift fails the listing). Audience forms: team/position counts, `N/A`, `Public`. PDF/DOCX only. Download BLOCKED unless `WOVEN_BCS_FILE_LIBRARY_DOWNLOAD_ENABLED`. |
| Communications (133) | list, audience forms | **Inventory only.** Drafts and "Published – Not Visible" excluded; detail unverified → BLOCKED. A published-and-visible status has not been observed and fails the listing until verified. Audience forms: team/position counts, `Public`. |

### Audience rules

Ask Bubbles shows every knowledge document to everyone signed in. So:

- **Shared automatically (Production launch rule):** only `All Teams All Positions`
  on a **File Library** item. Nothing else is company-wide until separately verified.
- **Waits for an administrator's decision:** `All Positions` (procedures — no
  position limit, but team/location limits are unverified).
- **Never shared, not even by a decision:** anything narrower
  (`8 Teams 21 Positions`, `All Teams 3 Positions`, a list of positions) →
  `audience_restricted`; anything unclear (`N/A`, no audience) → `audience_unclear`;
  `Public` (any content type, Handbooks included), and `All Teams All Positions`
  outside the File Library → `audience_unverified` (the label is verified; what
  it grants there is not, so it is not treated as company-wide).

### Records inside Midwest Soap Makers that name another company

The investigation found these records **inside the Midwest Soap Makers
company**: policies "JBA Policy Manual 2025" and "NE Sick Time", and the
handbook "2025 JBA Policy Manual - Edited 5-2025". Their presence is not a
reason to connect Ask Bubbles to any other Woven company, and it does not.

Records whose titles match the patterns in
`WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW` are held as `ownership_review`: never
ingested, never offered as an audience choice, withdrawn if ever synced. The
patterns only exclude; they select nothing. There is no automatic allowlist:
`confirmedEntityIds` is empty, and a record is released only after Buff City
Soap explicitly approves it, by adding its Woven id there in a reviewed change.

### Fail closed

A login page, 401/403, anti-forgery refusal, HTML where JSON was expected, a
missing property, schema drift, an unknown status, a duplicate id or an
incomplete procedure list fails **that listing**: its items are left exactly
as they were. While any listing in a run failed or looked incomplete, nothing
is removed anywhere for being absent (`removal_held_incomplete`). Removals of
more than 10 items and a quarter of the library are held for confirmation.

### Dry run

The admin screen's **Run Initial Scan** is the dry run (`mode: "preview"`). It
writes only its own run report and inventory — no knowledge document,
embedding, storage file or removal — and the report carries a plan: counts,
exclusions by reason, new / changed / removed / permission changes, what
would be ingested or downloaded, what would be downloaded once a download is
verified, flagged ownership records and errors.

From a terminal, with no database at all:

```bash
read -r  WOVEN_BCS_USERNAME && export WOVEN_BCS_USERNAME
read -rs WOVEN_BCS_PASSWORD && export WOVEN_BCS_PASSWORD
export WOVEN_BCS_COMPANY_ID=55839F24-9241-418C-8405-37BAF9A42A87
WOVEN_KNOWLEDGE_LIVE_DRY_RUN=1 WOVEN_KNOWLEDGE_SYNC_ENABLED=true npm run dry-run:woven-knowledge
```

### Still unverified (do not switch on without evidence)

- The File Library download response (`/Dashboard/_FileLibrary_Download`):
  bytes or redirect, headers, naming; and whether it records a download event
  in Woven's engagement analytics. Verify with ONE approved sample download,
  then set `WOVEN_BCS_FILE_LIBRARY_DOWNLOAD_ENABLED=true` on a Preview first.
- Handbook content/download for this company (no route borrowed from any
  other integration is used).
- Policy publication state and audience; procedure team/location limits and
  updated dates; per-item team/position ids; Communications detail and
  attachments; procedure attachment downloads; Shared Links.
- The procedure category indicator's exact markup (read from an element whose
  class names an indicator; a sanitized real response should confirm it).
- The Woven web app's sign-in and account-chooser steps were captured with
  the same login by the reference platform and not re-captured for BCS; they
  are tenant-neutral, and the company is chosen by the pinned id and proved on
  `/Company`, so a deviation fails the sign-in.
- An official Woven API for this account.

### Needed from Buff City Soap

| Item | Variable | Notes |
|---|---|---|
| Dedicated read-only Woven login (able to open the Company page) | `WOVEN_BCS_USERNAME`, `WOVEN_BCS_PASSWORD` | Sensitive |
| Confirmation of the pinned company | `WOVEN_BCS_COMPANY_ID` (required), `WOVEN_BCS_COMPANY_NAME` (optional) | `55839F24-9241-418C-8405-37BAF9A42A87` / `Midwest Soap Makers`; anything else disables the sync |

Woven is read at `https://app.woven.team` only. The reference platform's
`WOVEN_TEAM_*` variables configure nothing; a `WOVEN_TEAM_COMPANY`,
`WOVEN_TEAM_COMPANY_ID` or `WOVEN_TEAM_BASE_URL` holding anything but the
pinned value disables the connector.

Then `WOVEN_KNOWLEDGE_SYNC_ENABLED=true`, run the dry run, review it, decide
the "All Positions" audience, and only then run the initial sync.

## Isolation

- Both integrations' company is pinned by Company ID in
  `src/config/company/woven.ts` and proved against Woven on every run. No
  configuration can point either at another company.
- Credentials are server-only and never reach the browser
  (`npm run verify:secrets`).
