# District and regional managers get no name checks (sibling app only, 28 Nov 2026)

**Report (the owner's review, 28 Nov 2026, E2):** for a district or regional manager (a multi-store scope), the name
lookup against the roster is skipped, so names aren't checked. They should be checked against the roster of the
locations they cover. Found in the sibling app, where the loop answered "unchecked" for every district or region
login and the roster readers returned nobody for those scopes. Fixed there on branch
`claude/blissful-lovelace-kvbnvh-e2-dm-name-checks` (bad70fc91).

**Ask Bubbles: not needed.** Pau's decision 7 (21 Nov 2026) already gives a district or region login the roster of all
its stores: `loadScopedRosterResult` reads `authorizedLocationIds(scope)` (the stores the area contains, the same
stores forms are filed at), `agent-loop/tools.ts` `rosterFor` and the former-employee check read the same scope, and
replay case `nov21-agent-loop-scope-district-covers-all-its-stores` holds it. Checked on `main` 562b73fd0.

One edge, fixed with E1 (branch `claude/blissful-lovelace-kvbnvh-e1-roster-outage`, ffc821b0d): this app's store
list has no districts yet (`config/company/locations.ts`), so a login whose area is a district id resolves to no
store. The read's outcome for that is "not_checked / area_scope", which the loop read as an empty roster and so as
"not on the staff list" for everyone. It is now "unchecked" (the name used as typed). Assigning stores to districts
in the store list, so such a login is checked, is the owner's call.
