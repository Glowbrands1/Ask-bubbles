/**
 * ============================================================================
 * BUFF CITY SOAP — LOCATION ROSTER (COMPANY CONFIGURATION)
 * ============================================================================
 *
 * The locations, districts and regions this deployment authorizes against.
 * Location scope on every server route, the admin scope pickers, form
 * location checks and the assistant's location context all resolve through
 * this roster (via `src/lib/locations`).
 *
 * DELIBERATELY EMPTY. Buff City Soap's location hierarchy has not been
 * confirmed — neither the store numbering nor whether Woven carries districts
 * and regions. Inventing a roster would put fictional stores into
 * authorization decisions, so none is shipped. With an empty roster:
 *
 *   - global-scope users (admins, owners, developers) work normally;
 *   - location / district / region scoped users resolve to NO locations, and
 *     every location-scoped read returns nothing (fail closed, never open);
 *   - forms are created without a location unless the actor is global.
 *
 * To populate: add one entry per store. `code` is the store number as Buff's
 * systems print it (Woven's location "Number", payroll store id), and `id` is
 * derived from it — `loc-<code>` — so ids stay stable across renames.
 */

export interface CompanyLocationEntry {
  /** Store number as Buff's systems print it. Must match `LOCATION_CODE_PATTERN`. */
  readonly code: string;
  /** Display name, e.g. "Memphis — Midtown". */
  readonly name: string;
  /** Two-letter state, when known. */
  readonly state: string | null;
  readonly districtId: string | null;
}

export interface CompanyAreaEntry {
  readonly id: string;
  readonly name: string;
}

export interface CompanyDistrictEntry extends CompanyAreaEntry {
  readonly regionId: string | null;
}

/** What a store code may look like. Shared with the server-side scope checks. */
export const LOCATION_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,15}$/;

/**
 * The seven Buff City Soap stores, by Buff's own store number (the same codes
 * as `APPROVED_GOOGLE_STORES`). These are NOT Woven numbers: Woven numbers
 * three of these stores differently, so a Woven location reaches a store only
 * through an explicit `woven_location_map` decision — never by matching digits.
 */
export const COMPANY_LOCATION_ENTRIES: readonly CompanyLocationEntry[] = [
  { code: "66", name: "Kearney, NE", state: "NE", districtId: null },
  { code: "67", name: "Bellevue, NE", state: "NE", districtId: null },
  { code: "219", name: "Lee's Summit, MO", state: "MO", districtId: null },
  { code: "225", name: "Sioux Falls, SD (W 41st St)", state: "SD", districtId: null },
  { code: "236", name: "Grand Island, NE", state: "NE", districtId: null },
  { code: "264", name: "Omaha, NE (West Dodge Rd)", state: "NE", districtId: null },
  { code: "338", name: "Sioux Falls, SD (E 18th St)", state: "SD", districtId: null },
];

export const COMPANY_DISTRICT_ENTRIES: readonly CompanyDistrictEntry[] = [];

export const COMPANY_REGION_ENTRIES: readonly CompanyAreaEntry[] = [];

/**
 * What managers call a location other than by its roster name, keyed to its
 * code: "downtown" → "101". Each entry is a reviewed one-line addition, read
 * only where the sentence says it is a place (`location-mention.ts`). Empty
 * until Buff City Soap confirms them.
 */
export const COMPANY_LOCATION_NICKNAMES: Readonly<Record<string, string>> = {};

/**
 * Abbreviations managers type for a word in several location names, folded
 * before matching: "kc" → "kansas city". Empty until confirmed.
 */
export const COMPANY_LOCATION_ABBREVIATIONS: Readonly<Record<string, string>> = {};
