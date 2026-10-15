import {
  COMPANY_DISTRICTS,
  COMPANY_LOCATIONS,
  COMPANY_REGIONS,
  LOCATION_ID_PREFIX,
  locationById,
} from "@/lib/locations";
import type { AccessScope, ScopeLevel } from "@/types";
import { locationIdsInArea } from "@/lib/locations";

/**
 * ============================================================================
 * ADDITIONAL LOCATIONS — the locations somebody may access BEYOND their primary
 * ============================================================================
 *
 * NO NEW COLUMN. `app_users.scope_also_covers_area_ids` already holds them, the
 * profile mapper reads them, and every resolver (`forms/location-scope.ts`,
 * reporting scope) already unions them with the primary — including for a
 * district or region scope, where `locationIdsInArea("loc-…")` is that one
 * location. What was missing was any way to SET one from the Invite dialog,
 * which sent an empty list.
 *
 * A LOCATION IS ITS STABLE ID (`loc-<code>`), never its display name.
 *
 * Pure and free of `server-only`: the form (browser) and the directory module
 * (server) must agree on these rules. The browser's version stops an
 * administrator choosing something the server would refuse; the server's
 * version is the one that holds.
 */

/** The most additional locations one account may carry. */
export const MAX_ADDITIONAL_LOCATIONS = 60;

export interface AdditionalLocationOption {
  readonly id: string;
  readonly name: string;
}

/** Every location that can be granted explicitly, in roster order. */
export const ADDITIONAL_LOCATION_OPTIONS: readonly AdditionalLocationOption[] =
  COMPANY_LOCATIONS.map((location) => ({ id: location.id, name: location.name }));

export const isLocationAreaId = (id: string): boolean => id.startsWith(LOCATION_ID_PREFIX);

/**
 * What an administrator may pick as an additional location, given the primary.
 * The primary location is excluded (already granted). For a district or region
 * the primary is an AREA, so every location stays selectable: whether one falls
 * inside that area is the roster's answer, and a redundant grant is a union.
 */
export function additionalLocationOptions(primaryAreaId: string | null): AdditionalLocationOption[] {
  return ADDITIONAL_LOCATION_OPTIONS.filter((option) => option.id !== primaryAreaId);
}

/**
 * Cleans a list the way the server will: de-duplicated, order kept, the primary
 * removed, nothing at all for a global scope (it covers everything). It neither
 * truncates nor checks that an id is KNOWN — the caller refuses rather than
 * silently dropping part of an assignment.
 */
export function cleanAdditionalLocations(
  ids: readonly string[],
  scope: { level: ScopeLevel; primaryAreaId: string | null },
): string[] {
  if (scope.level === "global") return [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || id === scope.primaryAreaId || seen.has(id)) continue;
    seen.add(id);
  }
  return [...seen];
}

/**
 * The ids this scope may not carry.
 *
 *   location id            -> must be on the roster, at any level
 *   district / region id   -> only on a district or region scope, where the
 *                             resolvers read it as another area; on a
 *                             one-location scope it would be stored and match
 *                             nothing, which is worse than refusing
 *   anything else          -> unknown
 */
export function unknownAdditionalAreaIds(ids: readonly string[], level: ScopeLevel): string[] {
  return ids.filter((id) => {
    if (isLocationAreaId(id)) return !locationById(id);
    if (level === "district" || level === "region") {
      return !COMPANY_DISTRICTS.some((d) => d.id === id) && !COMPANY_REGIONS.some((r) => r.id === id);
    }
    return true;
  });
}

/**
 * The locations an administrator may offer, from THEIR OWN scope — or null when
 * nothing should be filtered (a global administrator, or a scope the browser
 * does not know). Convenience only: the form hides what the server would refuse
 * (`assertScopeWithinActor`), and the server remains the boundary.
 */
export function reachableLocationIds(scope: AccessScope | null | undefined): ReadonlySet<string> | null {
  if (!scope || scope.level === "global") return null;
  return new Set(
    [scope.primaryAreaId, ...scope.alsoCoversAreaIds]
      .filter((id): id is string => typeof id === "string")
      .flatMap((id) => locationIdsInArea(id)),
  );
}
