import { COMPANY_LOCATIONS, locationIdsInArea } from "@/lib/locations";
import type { AccessScope } from "@/types";

import type { StoreIndex } from "@/lib/stores/resolver";

import { ROSTER_STORE_INDEX, readLocation, rosterLocationName } from "./location-mention";

/**
 * ============================================================================
 * WHICH LOCATION A FORM MAY BE WRITTEN AGAINST
 * ============================================================================
 *
 * `POST /api/forms/instances` accepts a `locationId` from the request. The
 * authenticated actor's scope decides whether they may file against it — the
 * request body never does.
 *
 *   global      any location on the roster
 *   location    the locations their assignment names
 *   district    the roster locations inside their district(s)
 *   region      the roster locations inside their region(s)
 *
 * Area scopes resolve through the configured roster, and an area the roster
 * does not know resolves to NO locations. Fail closed, never open.
 */

/** The location ids this scope may file a form against. */
export function authorizedLocationIds(scope: AccessScope): string[] {
  const areas = [scope.primaryAreaId, ...scope.alsoCoversAreaIds].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (scope.level === "global") return COMPANY_LOCATIONS.map((location) => location.id);
  if (scope.level === "location") return [...new Set(areas)];
  return [...new Set(areas.flatMap((area) => locationIdsInArea(area)))];
}

export type LocationAuthorization =
  | { kind: "authorized"; locationId: string }
  | { kind: "no_location" }
  | { kind: "refused"; reason: string };

export function authorizeLocation(
  scope: AccessScope | null,
  requestedLocationId: string | null | undefined,
): LocationAuthorization {
  const requested = requestedLocationId?.trim() || null;

  if (!requested) return { kind: "no_location" };

  // No scope means demo/preview: nothing is persisted against a real location.
  if (!scope) return { kind: "authorized", locationId: requested };

  if (scope.level === "global") return { kind: "authorized", locationId: requested };

  if (authorizedLocationIds(scope).includes(requested)) {
    return { kind: "authorized", locationId: requested };
  }
  return {
    kind: "refused",
    reason:
      "That location is not on your assignment. A form can only be filed against a location you are assigned to.",
  };
}

export type LocationProposal =
  | { resolution: "resolved"; locationId: string }
  | {
      resolution: "needs_selection";
      authorizedIds: string[];
      outOfScopeName?: string;
      /** Why a store is still being asked for, when the manager named something. */
      selection?: { reason: "ambiguous" | "number_collision" | "confirm" | "not_found"; typed: string | null };
    }
  | { resolution: "not_applicable"; reason: string }
  | { resolution: "unavailable"; reason: string };

/**
 * The location a PROPOSED form would carry: the manager's own words first,
 * then the employee's directory locations, then the account's assignment.
 * Never a guess — several candidates is a question.
 */
export function proposeLocation(
  scope: AccessScope | null,
  managerText = "",
  employeeLocationIds: readonly string[] = [],
  index: StoreIndex = ROSTER_STORE_INDEX,
  options: { reportUnmatched?: boolean } = {},
): LocationProposal {
  const reportUnmatched = options.reportUnmatched ?? true;
  if (!scope) {
    return {
      resolution: "unavailable",
      reason: "Preview mode cannot verify a location, so none is filled in.",
    };
  }

  if (scope.level === "global") {
    const all = COMPANY_LOCATIONS.map((location) => location.id);
    const named = fromNamedLocations(all, managerText, index, reportUnmatched);
    if (named) return named;
    const employees = fromEmployeeLocations(all, employeeLocationIds);
    if (employees) return employees;
    return {
      resolution: "not_applicable",
      reason: "Your account covers every location rather than one, so no location is put on this form.",
    };
  }

  const allowed = authorizedLocationIds(scope);
  const named = fromNamedLocations(allowed, managerText, index, reportUnmatched);
  if (named) return named;
  const employees = fromEmployeeLocations(allowed, employeeLocationIds);
  if (employees) return employees;
  if (allowed.length === 1) return { resolution: "resolved", locationId: allowed[0]! };
  if (allowed.length > 1) return { resolution: "needs_selection", authorizedIds: allowed };
  return {
    resolution: "unavailable",
    reason: "Your account has no verified location assigned yet, so none can be filled in.",
  };
}

/**
 * WHAT THE MANAGER'S WORDS SAY ABOUT THE STORE, in this order of trust:
 *
 *   a firm reading     a registered code, name, partial name or reviewed alias
 *   a soft reading     a typo or initialism — asked about, never used silently
 *   nothing registered "Store 102" with no store 102 — said so, not skipped
 *
 * Several candidates is a question, and the candidates offered are only the
 * ones the actor's scope allows.
 */
function fromNamedLocations(
  allowed: readonly string[],
  managerText: string,
  index: StoreIndex,
  reportUnmatched: boolean,
): LocationProposal | null {
  const { mentions, unmatched } = readLocation(managerText, index);

  if (mentions.length === 0) {
    if (!reportUnmatched || unmatched.length === 0 || allowed.length === 0) return null;
    return {
      resolution: "needs_selection",
      authorizedIds: [...allowed],
      selection: { reason: "not_found", typed: unmatched[0]! },
    };
  }

  const firm = mentions.filter((mention) => !mention.confirm);
  const reading = firm.length > 0 ? firm : mentions;
  const soft = firm.length === 0;
  const named = [...new Set(reading.flatMap((mention) => mention.locationIds))];
  const inScope = named.filter((id) => allowed.includes(id));
  const typed = reading[0]?.matched ?? null;

  if (inScope.length === 1 && !soft) return { resolution: "resolved", locationId: inScope[0]! };
  if (inScope.length >= 1) {
    const collision = reading.some((mention) => mention.collision);
    return {
      resolution: "needs_selection",
      authorizedIds: inScope,
      selection: {
        reason: soft && inScope.length === 1 ? "confirm" : collision ? "number_collision" : "ambiguous",
        typed,
      },
    };
  }
  if (allowed.length === 0) return null;

  const outOfScopeName =
    mentions.length === 1 && named.length === 1 ? rosterLocationName(named[0]!) : null;
  return {
    resolution: "needs_selection",
    authorizedIds: [...allowed],
    ...(outOfScopeName ? { outOfScopeName } : {}),
  };
}

function fromEmployeeLocations(
  allowed: readonly string[],
  employeeLocationIds: readonly string[],
): LocationProposal | null {
  const inScope = [...new Set(employeeLocationIds)].filter((id) => allowed.includes(id));
  if (inScope.length === 1) return { resolution: "resolved", locationId: inScope[0]! };
  if (inScope.length > 1) return { resolution: "needs_selection", authorizedIds: inScope };
  return null;
}
