import {
  COMPANY_DISTRICT_ENTRIES,
  COMPANY_LOCATION_ENTRIES,
  COMPANY_REGION_ENTRIES,
  LOCATION_CODE_PATTERN,
  type CompanyLocationEntry,
} from "@/config/company/locations";

/**
 * ============================================================================
 * LOCATIONS — the platform view of the company roster
 * ============================================================================
 *
 * The roster itself is company configuration (`src/config/company/locations`).
 * This module turns it into the shape the rest of the app reads, and is the
 * ONLY module that knows the id convention:
 *
 *   location  loc-<code>
 *   district  dist-<slug>
 *   region    reg-<slug>
 *
 * Authorization resolves through here, so every helper is pure and total: an
 * id that is not on the roster resolves to nothing, never to a guess.
 */

export interface CompanyLocation {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly state: string | null;
  readonly districtId: string | null;
  readonly districtName: string | null;
  readonly regionId: string | null;
  readonly regionName: string | null;
}

export interface CompanyArea {
  readonly id: string;
  readonly name: string;
}

export interface CompanyDistrict extends CompanyArea {
  readonly regionId: string | null;
}

export const LOCATION_ID_PREFIX = "loc-";
export const DISTRICT_ID_PREFIX = "dist-";
export const REGION_ID_PREFIX = "reg-";

export { LOCATION_CODE_PATTERN };

export const COMPANY_REGIONS: readonly CompanyArea[] = COMPANY_REGION_ENTRIES;
export const COMPANY_DISTRICTS: readonly CompanyDistrict[] = COMPANY_DISTRICT_ENTRIES;

function toLocation(entry: CompanyLocationEntry): CompanyLocation {
  const district = COMPANY_DISTRICTS.find((candidate) => candidate.id === entry.districtId) ?? null;
  const region = district?.regionId
    ? (COMPANY_REGIONS.find((candidate) => candidate.id === district.regionId) ?? null)
    : null;
  return {
    id: locationIdForCode(entry.code),
    code: entry.code,
    name: entry.name,
    state: entry.state,
    districtId: district?.id ?? null,
    districtName: district?.name ?? null,
    regionId: region?.id ?? null,
    regionName: region?.name ?? null,
  };
}

export function locationIdForCode(code: string): string {
  return `${LOCATION_ID_PREFIX}${code}`;
}

/** The store code inside a location id, or null when it is not a well-formed location id. */
export function codeOfLocationId(id: string | null | undefined): string | null {
  if (!id || !id.startsWith(LOCATION_ID_PREFIX)) return null;
  const code = id.slice(LOCATION_ID_PREFIX.length);
  return LOCATION_CODE_PATTERN.test(code) ? code : null;
}

export const COMPANY_LOCATIONS: readonly CompanyLocation[] = COMPANY_LOCATION_ENTRIES.map(toLocation);

export function locationById(id: string | null | undefined): CompanyLocation | undefined {
  if (!id) return undefined;
  return COMPANY_LOCATIONS.find((entry) => entry.id === id);
}

export function locationByCode(code: string | null | undefined): CompanyLocation | undefined {
  if (!code) return undefined;
  return COMPANY_LOCATIONS.find((entry) => entry.code === code);
}

export function isKnownAreaId(id: string): boolean {
  return (
    COMPANY_LOCATIONS.some((entry) => entry.id === id) ||
    COMPANY_DISTRICTS.some((entry) => entry.id === id) ||
    COMPANY_REGIONS.some((entry) => entry.id === id)
  );
}

/** Location ids inside a district or region. Unknown areas resolve to none. */
export function locationIdsInArea(areaId: string): string[] {
  if (areaId.startsWith(LOCATION_ID_PREFIX)) {
    return locationById(areaId) ? [areaId] : [];
  }
  if (areaId.startsWith(DISTRICT_ID_PREFIX)) {
    return COMPANY_LOCATIONS.filter((entry) => entry.districtId === areaId).map((entry) => entry.id);
  }
  if (areaId.startsWith(REGION_ID_PREFIX)) {
    return COMPANY_LOCATIONS.filter((entry) => entry.regionId === areaId).map((entry) => entry.id);
  }
  return [];
}

export function areaLabel(areaId: string | null): string {
  if (!areaId) return "All areas";
  return (
    locationById(areaId)?.name ??
    COMPANY_DISTRICTS.find((entry) => entry.id === areaId)?.name ??
    COMPANY_REGIONS.find((entry) => entry.id === areaId)?.name ??
    areaId
  );
}

/**
 * A store name reduced to what two spellings of it share: case, spacing,
 * punctuation and "&" versus "and". Used to match a typed name to the roster;
 * never a fuzzy match.
 */
export function locationNameKey(name: string | null | undefined): string {
  return (name ?? "")
    .replace(/[\s   ]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s*&\s*/g, " and ")
    .replace(/[,.'’]/g, "")
    .replace(/\s*[-–—]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Problems with the configured roster. Empty when it is coherent. */
export function rosterProblems(): string[] {
  const problems: string[] = [];
  const codes = new Set<string>();
  for (const entry of COMPANY_LOCATION_ENTRIES) {
    if (!LOCATION_CODE_PATTERN.test(entry.code)) problems.push(`Location code "${entry.code}" is malformed.`);
    if (codes.has(entry.code)) problems.push(`Location code "${entry.code}" is listed twice.`);
    codes.add(entry.code);
    if (entry.districtId && !COMPANY_DISTRICTS.some((district) => district.id === entry.districtId)) {
      problems.push(`Location "${entry.code}" names unknown district "${entry.districtId}".`);
    }
  }
  for (const district of COMPANY_DISTRICTS) {
    if (!district.id.startsWith(DISTRICT_ID_PREFIX)) problems.push(`District id "${district.id}" must start with ${DISTRICT_ID_PREFIX}.`);
    if (district.regionId && !COMPANY_REGIONS.some((region) => region.id === district.regionId)) {
      problems.push(`District "${district.id}" names unknown region "${district.regionId}".`);
    }
  }
  for (const region of COMPANY_REGIONS) {
    if (!region.id.startsWith(REGION_ID_PREFIX)) problems.push(`Region id "${region.id}" must start with ${REGION_ID_PREFIX}.`);
  }
  return problems;
}
