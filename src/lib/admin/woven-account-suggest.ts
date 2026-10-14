import { codeOfLocationId, locationById, locationIdForCode } from "@/lib/locations";
import type { DirectoryRow, LocationMappingRow } from "@/lib/employees/woven/view-types";

/**
 * What the account form shows and suggests for a synced employee's locations.
 * A SUGGESTION ONLY: nothing here grants access, and Woven's own assignments
 * are shown as they are, matched or not.
 *
 * A Woven location counts as matched only when an administrator mapped it
 * (`woven_location_map` status `mapped`) to a location that is on the roster —
 * never by comparing numbers or names. "All locations" in Woven is offered as
 * a Global suggestion, and a physical store is not required for it.
 */

export interface WovenLocationView {
  wovenLocationId: string;
  name: string | null;
  /** The Ask Bubbles location id when confidently matched, else null (shown as unmatched). */
  areaId: string | null;
  expiresOn?: string | null;
}

export interface WovenLocationSuggestion {
  primary: WovenLocationView | null;
  additional: WovenLocationView[];
  temporary: WovenLocationView[];
  hasAllLocationAccess: boolean;
  suggestion: { level: "global" | "location" | "none"; primaryAreaId: string | null; alsoCoversAreaIds: string[] };
}

export function suggestLocations(row: DirectoryRow, maps: readonly LocationMappingRow[]): WovenLocationSuggestion {
  const byId = new Map(maps.map((m) => [m.wovenLocationId, m]));
  const areaOf = (wovenLocationId: string | null): string | null => {
    const m = wovenLocationId ? byId.get(wovenLocationId) : undefined;
    if (!m || m.status !== "mapped" || !m.locationCode) return null;
    const id = locationIdForCode(m.locationCode);
    return locationById(id) && codeOfLocationId(id) ? id : null;
  };
  const view = (id: string | null, name: string | null, expiresOn?: string | null): WovenLocationView => ({
    wovenLocationId: id ?? "",
    name,
    areaId: areaOf(id),
    ...(expiresOn !== undefined ? { expiresOn } : {}),
  });

  const primary = row.primaryLocationId ? view(row.primaryLocationId, row.primaryLocationName) : null;
  const additional = row.additionalLocations.map((l) => view(l.wovenLocationId, l.name));
  const temporary = row.temporaryOrExpiringLocations.map((l) => view(l.wovenLocationId, l.name, l.expiresOn));
  const hasAll = row.hasAllLocationAccess === true;

  /* Temporary and expiring assignments never feed a suggestion. */
  const matched = [primary, ...additional].filter((l): l is WovenLocationView => l !== null && l.areaId !== null);
  const unique = [...new Set(matched.map((l) => l.areaId as string))];
  /* If the Woven primary is unmatched but an additional one is, the first matched location leads: none is dropped. */
  const primaryArea = primary?.areaId ?? unique[0] ?? null;

  let suggestion: WovenLocationSuggestion["suggestion"] = { level: "none", primaryAreaId: null, alsoCoversAreaIds: [] };
  if (hasAll) suggestion = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
  else if (primaryArea) suggestion = { level: "location", primaryAreaId: primaryArea, alsoCoversAreaIds: unique.filter((id) => id !== primaryArea) };

  return { primary, additional, temporary, hasAllLocationAccess: hasAll, suggestion };
}
