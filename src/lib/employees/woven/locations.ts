import "server-only";

import { COMPANY_LOCATIONS, LOCATION_CODE_PATTERN, locationByCode, locationById } from "@/lib/locations";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { readId } from "./normalize";
import { classifyStatusError } from "./status";
import { EmployeeStoreError } from "./store";
import type { LocationMapStatus } from "./types";
import type { LocationMappingRow } from "./view-types";

/**
 * ============================================================================
 * THE WOVEN LOCATION → ASK BUBBLES LOCATION CROSSWALK
 * ============================================================================
 *
 * A PERSON DECIDES EVERY MAPPING. The sync queues each Woven location it sees
 * as `unmapped`, with Woven's catalog facts (Number, district, region, closed,
 * non-location) and — when Woven's Number equals a configured location code
 * exactly — a SUGGESTED location. It never maps one, and never fails because
 * one is unmapped.
 *
 * THE ROSTER IS CONFIGURATION (src/config/company/locations.ts). A mapping
 * stores the configured `loc-<code>` id; the reviewer names the code, and it
 * is checked against the roster here before the database is asked.
 *
 * NOTHING HERE CHANGES ACCESS. A mapping says which location a Woven location
 * is; it puts nobody into that location's scope.
 */

const PAGE = 1000;

/** The configured roster as code + name, for the read-only coverage comparison. */
export function listLocationsForComparison(): { number: string; name: string }[] {
  return COMPANY_LOCATIONS.map((location) => ({ number: location.code, name: location.name }));
}

/** Active affiliations per Woven location, counted from the location access table. */
async function headcounts(): Promise<Map<string, number>> {
  const db = getSupabaseAdmin();
  const counts = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("employee_location_affiliations")
      .select("woven_location_id")
      .eq("active", true)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw classifyStatusError(error);
    const page = (data ?? []) as Record<string, unknown>[];
    for (const row of page) counts.set(String(row.woven_location_id), (counts.get(String(row.woven_location_id)) ?? 0) + 1);
    if (page.length < PAGE) break;
  }
  return counts;
}

export async function listWovenLocations(): Promise<LocationMappingRow[]> {
  const [{ data, error }, counts] = await Promise.all([
    getSupabaseAdmin()
      .from("woven_location_map")
      .select(
        "woven_location_id, woven_location_name, woven_display_name, woven_location_number, woven_district_name, woven_region_name, is_closed, is_non_location, status, location_id, suggested_location_id, reviewed_by, reviewed_at",
      )
      .order("status", { ascending: true })
      .order("woven_location_name", { ascending: true }),
    headcounts(),
  ]);
  if (error) throw classifyStatusError(error);

  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const location = locationById(str(row.location_id));
    const suggested = locationById(str(row.suggested_location_id));
    return {
      wovenLocationId: String(row.woven_location_id),
      name: str(row.woven_location_name),
      displayName: str(row.woven_display_name),
      number: str(row.woven_location_number),
      districtName: str(row.woven_district_name),
      regionName: str(row.woven_region_name),
      isClosed: bool(row.is_closed),
      isNonLocation: bool(row.is_non_location),
      employeeCount: counts.get(String(row.woven_location_id)) ?? 0,
      status: row.status as LocationMapStatus,
      locationCode: location?.code ?? (str(row.location_id)?.replace(/^loc-/, "") ?? null),
      locationName: location?.name ?? null,
      suggestedLocationCode: suggested?.code ?? null,
      suggestedLocationName: suggested?.name ?? null,
      reviewedBy: str(row.reviewed_by),
      reviewedAt: str(row.reviewed_at),
    };
  });
}

export type ReviewResult = "reviewed" | "unknown_location" | "not_on_roster" | "reviewer_required";



export class LocationReviewError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "LocationReviewError";
  }
}

/** Validates a review request. Throws `LocationReviewError` with a sentence to show. */
export function parseLocationReview(body: Partial<Record<string, unknown>>): {
  wovenLocationId: string;
  status: LocationMapStatus;
  locationCode: string | null;
} {
  const wovenLocationId = readId(body.wovenLocationId);
  if (!wovenLocationId) throw new LocationReviewError("A Woven location id is required.");

  const status = body.status;
  if (status !== "mapped" && status !== "ignored" && status !== "unmapped") {
    throw new LocationReviewError("A location is `mapped`, `ignored` or `unmapped`.");
  }

  if (status !== "mapped") return { wovenLocationId, status, locationCode: null };

  const locationCode = typeof body.locationCode === "string" ? body.locationCode.trim() : "";
  if (!LOCATION_CODE_PATTERN.test(locationCode)) {
    throw new LocationReviewError("Mapping a location needs its configured location code.");
  }
  return { wovenLocationId, status, locationCode };
}

export async function reviewWovenLocation(input: {
  wovenLocationId: string;
  status: LocationMapStatus;
  locationCode: string | null;
  reviewedBy: string;
}): Promise<ReviewResult> {
  let locationId: string | null = null;
  if (input.status === "mapped") {
    locationId = locationByCode(input.locationCode)?.id ?? null;
    if (!locationId) return "not_on_roster";
  }
  const { data, error } = await getSupabaseAdmin().rpc("woven_location_map_review", {
    p_woven_location_id: input.wovenLocationId,
    p_status: input.status,
    p_location_id: locationId,
    p_reviewed_by: input.reviewedBy,
  });
  if (error) {
    throw new EmployeeStoreError("store_unavailable", "The Woven location could not be updated.");
  }
  const status = (data as { status?: unknown } | null)?.status;
  if (status === "invalid_location") return "not_on_roster";
  return status === "reviewed" || status === "unknown_location" || status === "reviewer_required"
    ? status
    : "unknown_location";
}
