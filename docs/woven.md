# Woven — the Buff City Soap adapter

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
| Buff's Woven CompanyID (GUID) | `WOVEN_COMPANY_ID` | **Required before any sync.** Run the read-only validation (below) to discover it |
| API base URL, if not the default | `WOVEN_API_BASE_URL` | |
| Login-eligible email domains | `WOVEN_LOGIN_EMAIL_DOMAINS` | Unset = nobody is eligible to sign in from Woven data |

### Switching it on, in order

1. Set the credentials and `WOVEN_VALIDATION_ENABLED=true`. Run **Test Woven
   connection** on the Woven screen. It is read-only and reports Buff's
   company, enum vocabularies, position and location catalogue and how the
   locations compare with the configured roster.
2. Set `WOVEN_COMPANY_ID` from that report.
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
session state — and the same login also opens JB & Associates (Sun Tan City).
So:

1. The Company ID is **pinned** in `src/config/company/woven.ts`
   (`WOVEN_KNOWLEDGE_TENANT`). `WOVEN_TEAM_COMPANY_ID` must equal it, or the
   sync is disabled and the credentials are withheld.
2. On the account chooser, the entry is chosen by its `data-company-id`, and
   its name must be `WOVEN_TEAM_COMPANY`.
3. `GET /Company` must show exactly that Company ID — every reading of it —
   before anything is read. Missing, different, or two ids: the run fails.
4. The check runs again after every automatic re-sign-in, and after every
   listing **before** anything is classified or applied.

The integration login must therefore be able to open the Company page.

### What is synced, and what is not

| Source | Verified for BCS | What happens |
|---|---|---|
| Policies (12) | list + detail structure | **Inventory only.** Publication state is unverified, so every policy is excluded as `publication_unverified`. |
| Handbooks (1) | list | Published + `Public` is shareable. Download unverified → BLOCKED unless `WOVEN_HANDBOOK_DOWNLOAD_ENABLED`. The one handbook is a JBA manual → held for ownership review. |
| Procedures (51) | category enumeration, badges, positions, detail steps | Drafts (`Unpublished`) excluded; their pages are never fetched. Each category's count must equal its indicator or the listing fails. Step text is ingested once the "All Positions" audience is shared by an administrator. Step attachments: BLOCKED (download unverified). |
| File Library (264) | list, columns, status keys, audiences | Unpublished excluded. Columns proved on every row (schema drift fails the listing). PDF/DOCX only. Download BLOCKED unless `WOVEN_FILE_LIBRARY_DOWNLOAD_ENABLED`. |
| Communications (133) | list | **Inventory only.** Drafts and "Published – Not Visible" excluded; detail unverified → BLOCKED. A published-and-visible status has not been observed and fails the listing until verified. |

### Audience rules

Ask Bubbles shows every knowledge document to everyone signed in. So:

- **Shared automatically:** `Public`, `All Teams All Positions`.
- **Waits for an administrator's decision:** `All Positions` (procedures — no
  position limit, but team/location limits are unverified).
- **Never shared, not even by a decision:** anything narrower
  (`8 Teams 21 Positions`, `All Teams 3 Positions`, a list of positions) →
  `audience_restricted`; anything unclear (`N/A`, no audience) → `audience_unclear`.

### Ownership review (JB & Associates / Sun Tan City content)

Records whose titles name JBA / JB & Associates / Sun Tan City, and
"NE Sick Time", are held as `ownership_review`: never ingested, never offered
as an audience choice, withdrawn if ever synced. Found so far: policies
"JBA Policy Manual 2025", "NE Sick Time"; handbook "2025 JBA Policy Manual -
Edited 5-2025". To release one, confirm with Buff City Soap that it is meant
for their team members and add its Woven id to
`WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW.confirmedEntityIds`.

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
read -r  WOVEN_TEAM_USERNAME && export WOVEN_TEAM_USERNAME
read -rs WOVEN_TEAM_PASSWORD && export WOVEN_TEAM_PASSWORD
export WOVEN_TEAM_COMPANY="Midwest Soap Makers"
export WOVEN_TEAM_COMPANY_ID=55839F24-9241-418C-8405-37BAF9A42A87
WOVEN_KNOWLEDGE_LIVE_DRY_RUN=1 WOVEN_KNOWLEDGE_SYNC_ENABLED=true npm run dry-run:woven-knowledge
```

### Still unverified (do not switch on without evidence)

- The File Library download response (`/Dashboard/_FileLibrary_Download`):
  bytes or redirect, headers, naming; and whether it records a download event
  in Woven's engagement analytics. Verify with ONE approved sample download,
  then set `WOVEN_FILE_LIBRARY_DOWNLOAD_ENABLED=true` on a Preview first.
- Handbook content/download for this company (the flow behind
  `WOVEN_HANDBOOK_DOWNLOAD_ENABLED` was verified for another company).
- Policy publication state and audience; procedure team/location limits and
  updated dates; per-item team/position ids; Communications detail and
  attachments; procedure attachment downloads; Shared Links.
- The procedure category indicator's exact markup (read from an element whose
  class names an indicator; a sanitized real response should confirm it).
- The sign-in and account-chooser steps for this account (verified on the
  same login by the reference platform; not re-captured for BCS).
- An official Woven API for this account.

### Needed from Buff City Soap

| Item | Variable | Notes |
|---|---|---|
| Dedicated read-only Woven Team login (able to open the Company page) | `WOVEN_TEAM_USERNAME`, `WOVEN_TEAM_PASSWORD` | Sensitive |
| Company name / ID | `WOVEN_TEAM_COMPANY`, `WOVEN_TEAM_COMPANY_ID` | `Midwest Soap Makers` / `55839F24-9241-418C-8405-37BAF9A42A87` |
| Base URL, if not `https://app.woven.team` | `WOVEN_TEAM_BASE_URL` | |

Then `WOVEN_KNOWLEDGE_SYNC_ENABLED=true`, run the dry run, review it, decide
the "All Positions" audience, and only then run the initial sync.

## Isolation

- The knowledge sync's company is pinned by Company ID in
  `src/config/company/woven.ts` and proved against Woven before and during
  every run; the employee directory's company is required configuration.
  Neither can sync another company's people or documents by default.
- Credentials are server-only and never reach the browser
  (`npm run verify:secrets`).
