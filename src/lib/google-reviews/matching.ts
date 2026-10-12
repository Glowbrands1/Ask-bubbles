import { APPROVED_GOOGLE_STORES, OTHER_BRAND_TITLE_MARKERS, type ApprovedGoogleStore } from "@/config/company/google-reviews";

import type { GoogleLocation, MatchConfidence, MatchStatus } from "./types";

/**
 * MATCHING GOOGLE LOCATIONS TO THE SEVEN APPROVED STORES.
 *
 * THE RULE: a Google location is linked to a store only when Google ITSELF says
 * so twice — its `storeCode` equals the store's code EXACTLY, and its storefront
 * address names the store's street, city, state and ZIP. Nothing else links
 * automatically.
 *
 *   store code AND address agree        matched    (high)   → reviews are read
 *   store code agrees, no address given candidate  (medium) → an administrator must confirm
 *   address agrees, no store code       candidate  (medium) → an administrator must confirm
 *   store code agrees, address differs  mismatch   (low)    → NOT linked; shown for review
 *   address agrees, a DIFFERENT code    mismatch   (low)    → NOT linked; shown for review
 *   two equally good locations          ambiguous           → NOT linked
 *   nothing                             unmatched
 *
 * NEVER: arithmetic on a number from another system, a match on a name alone, or
 * a link to a location that another store already holds.
 *
 * OTHER BRANDS ARE BLOCKED FIRST. A location whose title carries another brand's name (see OTHER_BRAND_TITLE_MARKERS) is
 * dropped before any comparison, even if its code and address happen to match an
 * approved store, and counted only as a number. Everything in the account that
 * is not one of the seven is ignored the same way: counted, never stored.
 */

export interface StoreMatch {
  readonly store: ApprovedGoogleStore;
  readonly status: MatchStatus;
  readonly confidence: MatchConfidence;
  /** Set only for `matched`. */
  readonly accountName: string | null;
  readonly locationName: string | null;
  /** Field names, booleans and — for one candidate — its business title and street. No personal data. */
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface MatchReport {
  readonly stores: readonly StoreMatch[];
  readonly googleLocationsSeen: number;
  /** Locations in the account that match none of the seven. Counted only. */
  readonly ignoredNotApproved: number;
  /** Locations dropped because their title names another brand. Counted only. */
  readonly blockedOtherBrand: number;
}

const STREET_WORDS: Readonly<Record<string, string>> = {
  street: "st", drive: "dr", road: "rd", avenue: "ave", boulevard: "blvd", lane: "ln", parkway: "pkwy", highway: "hwy",
  court: "ct", circle: "cir", place: "pl", suite: "ste", north: "n", south: "s", east: "e", west: "w",
  northwest: "nw", northeast: "ne", southwest: "sw", southeast: "se",
};

/** Lower-case, strip punctuation, collapse spacing, abbreviate street words. */
export function normalizeAddressText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => STREET_WORDS[token] ?? token)
    .join(" ");
}

const plain = (value: string | null | undefined) => normalizeAddressText(value ?? "").replace(/['-]/g, "");

interface AddressAgreement {
  street: boolean;
  city: boolean;
  state: boolean;
  postal: boolean;
  present: boolean;
}

function compareAddress(store: ApprovedGoogleStore, location: GoogleLocation): AddressAgreement {
  const a = location.address;
  if (!a) return { street: false, city: false, state: false, postal: false, present: false };
  // The store's street line must appear, token for token, in Google's lines (which may carry the suite on the same line).
  const google = ` ${normalizeAddressText(a.lines.join(" "))} `;
  const street = google.includes(` ${normalizeAddressText(store.addressLine1)} `);
  return {
    street,
    city: plain(a.locality) === plain(store.city),
    state: (a.administrativeArea ?? "").trim().toUpperCase() === store.state,
    postal: (a.postalCode ?? "").trim().slice(0, 5) === store.postalCode.slice(0, 5),
    present: true,
  };
}

const addressAgrees = (g: AddressAgreement) => g.present && g.street && g.city && g.state && g.postal;

export function isOtherBrandTitle(title: string | null): boolean {
  if (!title) return false;
  const squashed = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  return OTHER_BRAND_TITLE_MARKERS.some((marker) => squashed.includes(marker.toLowerCase().replace(/[^a-z0-9]/g, "")));
}

type Verdict = "matched" | "candidate" | "mismatch" | "none";

function judge(store: ApprovedGoogleStore, location: GoogleLocation): { verdict: Verdict; codeEqual: boolean; agreement: AddressAgreement; codeConflict: boolean } {
  const codeEqual = location.storeCode !== null && location.storeCode === store.code;
  const codeConflict = location.storeCode !== null && location.storeCode !== store.code;
  const agreement = compareAddress(store, location);
  const addr = addressAgrees(agreement);

  let verdict: Verdict = "none";
  if (codeEqual && addr) verdict = "matched";
  else if (codeEqual && !agreement.present) verdict = "candidate";
  else if (codeEqual) verdict = "mismatch";
  else if (addr && !codeConflict) verdict = "candidate"; // right address, no code set in the profile
  else if (addr && codeConflict) verdict = "mismatch"; // right address, but Google says a different store number
  return { verdict, codeEqual, agreement, codeConflict };
}

export function matchApprovedStores(
  googleLocations: readonly GoogleLocation[],
  stores: readonly ApprovedGoogleStore[] = APPROVED_GOOGLE_STORES,
): MatchReport {
  const eligible: GoogleLocation[] = [];
  let blockedOtherBrand = 0;
  for (const g of googleLocations) {
    if (isOtherBrandTitle(g.title)) blockedOtherBrand += 1;
    else eligible.push(g);
  }

  // Judge every (store, location) pair once.
  const judged = stores.map((store) => ({
    store,
    rows: eligible.map((g) => ({ g, ...judge(store, g) })).filter((row) => row.verdict !== "none"),
  }));

  // A Google location that is a full match for more than one store would link twice: both become ambiguous.
  const fullMatchOwners = new Map<string, string[]>();
  for (const { store, rows } of judged) {
    for (const row of rows) {
      if (row.verdict !== "matched") continue;
      const key = `${row.g.accountName}/${row.g.locationName}`;
      fullMatchOwners.set(key, [...(fullMatchOwners.get(key) ?? []), store.code]);
    }
  }

  const used = new Set<string>();
  const results: StoreMatch[] = judged.map(({ store, rows }) => {
    for (const row of rows) used.add(`${row.g.accountName}/${row.g.locationName}`);
    const matched = rows.filter((r) => r.verdict === "matched");
    const candidates = rows.filter((r) => r.verdict === "candidate");
    const mismatches = rows.filter((r) => r.verdict === "mismatch");

    const base = (r?: (typeof rows)[number]) => ({
      google_store_code_present: r ? r.g.storeCode !== null : null,
      store_code_equal: r ? r.codeEqual : null,
      address_present: r ? r.agreement.present : null,
      street_equal: r ? r.agreement.street : null,
      city_equal: r ? r.agreement.city : null,
      state_equal: r ? r.agreement.state : null,
      postal_equal: r ? r.agreement.postal : null,
    });

    if (matched.length === 1) {
      const m = matched[0]!;
      const owners = fullMatchOwners.get(`${m.g.accountName}/${m.g.locationName}`) ?? [];
      if (owners.length > 1) return { store, status: "ambiguous", confidence: "none", accountName: null, locationName: null, evidence: { reason: "location_matches_several_stores", competing_matches: owners.length } };
      return { store, status: "matched", confidence: "high", accountName: m.g.accountName, locationName: m.g.locationName, evidence: base(m) };
    }
    if (matched.length > 1) return { store, status: "ambiguous", confidence: "none", accountName: null, locationName: null, evidence: { reason: "several_google_locations_match", competing_matches: matched.length } };

    if (candidates.length === 1) {
      const c = candidates[0]!;
      return {
        store,
        status: "candidate",
        confidence: "medium",
        accountName: null,
        locationName: null,
        evidence: {
          ...base(c),
          // What an administrator needs to decide: which Google location, and what it is called and where.
          candidate: { account: c.g.accountName, location: c.g.locationName, title: c.g.title, street: c.g.address?.lines[0] ?? null, city: c.g.address?.locality ?? null, state: c.g.address?.administrativeArea ?? null },
        },
      };
    }
    if (candidates.length > 1) return { store, status: "ambiguous", confidence: "none", accountName: null, locationName: null, evidence: { reason: "several_candidates", candidates: candidates.length } };

    if (mismatches.length > 0) {
      const m = mismatches[0]!;
      return { store, status: "mismatch", confidence: "low", accountName: null, locationName: null, evidence: { ...base(m), reason: m.codeEqual ? "store_code_matches_but_address_differs" : "address_matches_but_store_code_differs", mismatches: mismatches.length } };
    }
    return { store, status: "unmatched", confidence: "none", accountName: null, locationName: null, evidence: { reason: "no_google_location_found" } };
  });

  return {
    stores: results,
    googleLocationsSeen: googleLocations.length,
    ignoredNotApproved: eligible.filter((g) => !used.has(`${g.accountName}/${g.locationName}`)).length,
    blockedOtherBrand,
  };
}
