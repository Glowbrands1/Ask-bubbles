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

## 2. Knowledge (Woven Team web app)

Code: `src/lib/knowledge-sync/woven`. Admin screen:
`/admin/integrations/woven-knowledge`.

Reads handbooks, policies and training from Woven Team into the knowledge base
every 30 days once enabled. Items shared only with certain teams wait for an
administrator's audience decision; nothing restricted is published to everyone
automatically.

### Needed from Buff City Soap

| Item | Variable | Notes |
|---|---|---|
| Dedicated read-only Woven Team login | `WOVEN_TEAM_USERNAME`, `WOVEN_TEAM_PASSWORD` | Sensitive |
| Exact Woven company name | `WOVEN_TEAM_COMPANY` | **Required.** A login can belong to several companies; the sync refuses to read unless this one is active after sign-in |
| Base URL, if not `https://app.woven.team` | `WOVEN_TEAM_BASE_URL` | |

Then `WOVEN_KNOWLEDGE_SYNC_ENABLED=true`.

## Isolation

- No Woven company, tenant name or identifier is hard-coded. Both company
  identifiers are required configuration, so this deployment cannot sync
  another company's people or documents by default.
- Credentials are server-only and never reach the browser
  (`npm run verify:secrets`).
