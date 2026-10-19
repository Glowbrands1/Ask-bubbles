# Production smoke checklist (read-only), for an authorized person

For the Ask Bubbles production site, `https://askbubbles.vercel.app`, after the security, procedure-selector and cleanup merges (PRs #52, #55, #53).
Written because the automated tooling here cannot reach the site, and creating a protection-bypass link on the Vercel project needs separate approval.
**Nothing below creates, edits or deletes any employee, account, form, review or financial record.** Do not do anything not listed.

## 1. Health endpoint (no sign-in; a normal network)

```bash
curl -s https://askbubbles.vercel.app/api/health | python3 -m json.tool
```
Expected, from the code in `src/app/api/health/route.ts`: HTTP 200, and in the JSON

| Field | Expect |
|---|---|
| `mode` | `"live"` |
| `deploymentEnvironment` | `"production"` |
| `configured` | `true`; `missingEnvironmentVariables` and `configurationProblems` are `[]` |
| `services.supabase.configured` | `true` |
| `services.authentication.unauthenticatedAccessAllowed` | `false` |
| `qa.assistant.provider` | `"claude"` |
| `qa.reporting.dependsOnMode` | `true`, and `note` starts "Every report reads the reporting tables in Supabase." **This is how you confirm PR #52 is live.** |

Read `securityWarnings`; an empty list is expected but investigate anything listed. Any HTTP 500 is a failure.

## 2. The cross-site guard (PR #52). Refused before anything happens, so it changes nothing

```bash
curl -i -X POST -H 'Origin: https://evil.example' https://askbubbles.vercel.app/api/admin/google-reviews/disconnect
```
Expect **HTTP 403** with `{"status":"refused","reason":"Cross-site request refused."}`. (It carries no session and is refused by the origin check first.)
A plain request with no `Origin` header and no session should instead answer 401, not 403, and must not disconnect anything because it is not signed in.

## 3. Signed in as an administrator (read-only clicks)

1. **Admin, then Integrations, then Google Reviews:** the page loads, shows the connection state and the seven stores. **Do not click Connect, Disconnect or any Sync button.**
2. **Admin, then Users:** the list loads. **Do not create, invite, edit or disable anyone.**
3. **Admin, then Integrations, then Woven:** the page loads. **Do not run a sync or a connection test.**
4. Optional: ask the chat one harmless question that names no employee (for example "What is our uniform policy?"). It records a conversation and an activity event, but no employee or financial data.

## 4. Logs (Vercel, Observability, Runtime logs, production)

For the last hour: no error or warning lines, and no `DemoModeRefusesPrivilegedKeyError`.

## If any step fails
Stop, do not retry actions, and report the step, the HTTP status and the time. Rolling back a merge is a separate decision.
