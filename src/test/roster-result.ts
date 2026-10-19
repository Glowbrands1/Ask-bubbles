import type { RosterEmployee } from "@/lib/forms/employee-match";
import type { DirectoryRosterRow, ScopedRosterResult } from "@/lib/forms/employee-roster";
import type { AccessScope } from "@/types";

/**
 * A fake directory read for tests that exercise form flows rather than Woven
 * verification: the production scoping rule over the rows the test supplies,
 * every row freshly synced unless it says otherwise. An empty roster is the
 * silent "nothing to check against" outcome, so these flows are not given a
 * verification note they were never about.
 */
export function rosterResultFor(
  scopeRoster: (rows: readonly DirectoryRosterRow[], scope: AccessScope | null) => RosterEmployee[],
  rows: readonly DirectoryRosterRow[],
  scope: AccessScope | null,
): ScopedRosterResult {
  if (!scope) return { status: "not_checked", reason: "no_scope" };
  const fresh = rows.map((row) => ({ lastSyncedAt: new Date().toISOString(), ...row }));
  const roster = scopeRoster(fresh, scope);
  return roster.length === 0 ? { status: "not_checked", reason: "no_scope" } : { status: "ok", roster };
}
