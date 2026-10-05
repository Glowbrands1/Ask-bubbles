import { ACTIVE_BRAND } from "@/lib/brand";
import { authorizedLocationIds as formAuthorizedLocationIds } from "@/lib/forms/location-scope";
import { areaLabel } from "@/lib/locations";
import type { AccessScope } from "@/types";

/**
 * ============================================================================
 * WHOSE FIGURES A PERSON MAY SEE
 * ============================================================================
 *
 * Every report read is filtered by the asker's resolved scope. Reporting
 * tables are server-only (no browser grants, RLS forced), so this predicate IS
 * the boundary, and it is written to fail closed:
 *
 *   unrestricted   global scope only — every location
 *   locationIds    the roster locations this scope covers; EMPTY means the
 *                  person sees no location's figures at all
 *
 * NULL IS UNRESTRICTED, AN EMPTY LIST IS NOTHING, and the two are never
 * confused: a missing scope (an unverified caller) resolves to nothing.
 * Selections intersect with the scope — a filter can only narrow it.
 */
export interface ReportingScope {
  readonly unrestricted: boolean;
  readonly locationIds: readonly string[];
  readonly areaLabel: string | null;
  readonly level: AccessScope["level"] | null;
}

export function reportingScopeOf(scope: AccessScope | null | undefined): ReportingScope {
  if (!scope) {
    return { unrestricted: false, locationIds: [], areaLabel: null, level: null };
  }
  if (scope.level === "global") {
    return { unrestricted: true, locationIds: [], areaLabel: null, level: "global" };
  }
  return {
    unrestricted: false,
    locationIds: [...new Set(formAuthorizedLocationIds(scope))].sort(),
    areaLabel: scope.primaryAreaId ? areaLabel(scope.primaryAreaId) : null,
    level: scope.level,
  };
}

/** A requested location filter, narrowed to what the scope covers. */
export function narrowLocationSelection(
  scope: ReportingScope,
  requested: readonly string[],
): string[] {
  if (scope.unrestricted) return [...requested];
  if (requested.length === 0) return [...scope.locationIds];
  const allowed = new Set(scope.locationIds);
  return requested.filter((id) => allowed.has(id));
}

/** Whether a row for this location may be shown. A row with no location is shown only to global scope. */
export function admitsLocation(scope: ReportingScope, locationId: string | null | undefined): boolean {
  if (scope.unrestricted) return true;
  if (!locationId) return false;
  return scope.locationIds.includes(locationId);
}

/** Location ids for a query filter: null means no filter (global). */
export function locationIdsForScope(scope: ReportingScope): string[] | null {
  return scope.unrestricted ? null : [...scope.locationIds];
}

/** The one sentence a report page shows about whose figures these are. */
export function scopeNoticeSentence(scope: ReportingScope): string | null {
  if (scope.unrestricted) return null;
  const noun = ACTIVE_BRAND.vocabulary.locationNoun;
  const plural = ACTIVE_BRAND.vocabulary.locationNounPlural;
  const count = scope.locationIds.length;
  const where = scope.areaLabel ? ` for ${scope.areaLabel}` : "";
  if (count === 0) {
    return `Your account has no ${noun} assigned to it yet, so no ${noun} figures are shown${where}. An administrator can set your assignment in User Management.`;
  }
  return `Scoped to your assignment${where}: ${count} ${count === 1 ? noun : plural}. Figures on this page cover only those ${plural}.`;
}
