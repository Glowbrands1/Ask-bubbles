import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AccessScope } from "@/types";

import { isServiceAccountName, type RosterEmployee } from "./employee-match";
import { authorizedLocationIds } from "./location-scope";

/**
 * ============================================================================
 * THE EMPLOYEES A FORM-FILER MAY NAME — FROM THE WOVEN DIRECTORY, IN SCOPE
 * ============================================================================
 *
 * READ-ONLY USE OF THE PHASE-ONE DIRECTORY. `employee_access_directory` is the
 * observe-only Woven sync (docs/woven-employee-sync.md). Nothing here writes to
 * it, and nothing here grants access: it is read to check a SPELLING and to
 * learn which location an employee works at, after the actor's own scope has
 * already decided which locations they may file against.
 *
 * SCOPE IS APPLIED HERE, BEFORE ANY NAME LEAVES THE SERVER:
 *
 *   location     employees with an active, person-mapped affiliation at one of the
 *             actor's own locations. Nobody else is ever a candidate.
 *   global    every active employee — a global scope excludes no location.
 *   district  employees at the locations the area contains, resolved through
 *   region    the location roster (`authorizedLocationIds`). An area the roster
 *             does not know resolves to no location, so to NOBODY — and an
 *             empty roster means the typed name is used as typed.
 *   demo      NOBODY. A demo actor has no verified scope.
 *
 * FAILS TO "UNCHECKED", NEVER TO "EVERYONE". Any read error returns an empty
 * roster, and an empty roster changes nothing about the form: the name the
 * manager typed is used, as it always was.
 *
 * TERMINATED EMPLOYEES ARE LEFT OUT. A coaching form is about somebody on the
 * team today. `unknown` statuses stay in — the sync never reads `unknown` as
 * terminated, and neither does this.
 *
 * SHARED AND SERVICE ACCOUNTS ARE LEFT OUT. "Risk Management", "No Manager"
 * and "GlowBrands IT Support" are directory rows, not people; a row is left
 * out only when every word of its name is a department, role or system word.
 * See `isServiceAccountName`. The directory itself is never changed.
 */

export interface DirectoryRosterRow {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly preferredFirstName: string | null;
  readonly employmentStatus: string | null;
  readonly locationIds: readonly string[];
}

/** Restricts the directory to what this actor may see. Pure. */
export function scopeRoster(
  rows: readonly DirectoryRosterRow[],
  scope: AccessScope | null,
): RosterEmployee[] {
  if (!scope) return [];
  // Area scopes resolve through the location roster; an unknown area resolves to none.
  const allowed = scope.level === "global" ? null : new Set(authorizedLocationIds(scope));
  if (allowed && allowed.size === 0) return [];

  const roster: RosterEmployee[] = [];
  for (const row of rows) {
    if (row.employmentStatus === "terminated") continue;
    const first = row.firstName?.trim() ?? "";
    const last = row.lastName?.trim() ?? "";
    if (!first || !last) continue;
    // "Risk Management", "No Manager": a shared or service account, never a suggestion.
    if (isServiceAccountName(first, last)) continue;
    const locationIds = allowed ? row.locationIds.filter((id) => allowed.has(id)) : [...row.locationIds];
    if (allowed && locationIds.length === 0) continue;
    roster.push({
      id: row.id,
      firstName: first,
      lastName: last,
      preferredFirstName: row.preferredFirstName?.trim() || null,
      locationIds,
    });
  }
  return roster;
}

/**
 * The whole directory, joined to configured locations through the
 * person-reviewed location map, which stores the `loc-<code>` id directly.
 * Three small reads joined in memory.
 */
export async function readDirectoryRoster(): Promise<DirectoryRosterRow[]> {
  const supabase = getSupabaseAdmin();
  const [people, affiliations, map] = await Promise.all([
    supabase
      .from("employee_access_directory")
      .select("id, first_name, last_name, preferred_first_name, employment_status")
      .limit(5000),
    supabase
      .from("employee_location_affiliations")
      .select("employee_id, woven_location_id")
      .eq("active", true)
      .limit(20000),
    supabase
      .from("woven_location_map")
      .select("woven_location_id, location_id")
      .eq("status", "mapped")
      .limit(1000),
  ]);
  if (people.error || affiliations.error || map.error) {
    throw new Error("The employee directory could not be read.");
  }

  const locationByWoven = new Map<string, string>();
  for (const row of map.data ?? []) {
    if (typeof row.location_id === "string" && row.location_id.startsWith("loc-")) {
      locationByWoven.set(String(row.woven_location_id), row.location_id);
    }
  }
  const locationsByEmployee = new Map<string, Set<string>>();
  for (const row of affiliations.data ?? []) {
    const location = locationByWoven.get(String(row.woven_location_id));
    if (!location) continue;
    const key = String(row.employee_id);
    if (!locationsByEmployee.has(key)) locationsByEmployee.set(key, new Set());
    locationsByEmployee.get(key)!.add(location);
  }

  return (people.data ?? []).map((row) => ({
    id: String(row.id),
    firstName: (row.first_name as string | null) ?? null,
    lastName: (row.last_name as string | null) ?? null,
    preferredFirstName: (row.preferred_first_name as string | null) ?? null,
    employmentStatus: (row.employment_status as string | null) ?? null,
    locationIds: [...(locationsByEmployee.get(String(row.id)) ?? [])].sort(),
  }));
}

/**
 * The scoped roster for one actor, or empty when it cannot be established.
 * Never throws: a directory outage must not stop a manager filing a form.
 */
export async function loadScopedRoster(scope: AccessScope | null): Promise<RosterEmployee[]> {
  if (!scope || scope.level === "district" || scope.level === "region") return [];
  try {
    return scopeRoster(await readDirectoryRoster(), scope);
  } catch {
    return [];
  }
}
