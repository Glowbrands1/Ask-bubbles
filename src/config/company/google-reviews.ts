/**
 * ============================================================================
 * BUFF CITY SOAP — THE GOOGLE BUSINESS PROFILES ASK BUBBLES MAY READ
 * ============================================================================
 *
 * The Google Business Profile account Buff City Soap's administrators sign in
 * with shows 22 businesses: 7 Buff City Soap and 15 belonging to a sister brand. ONLY THE SEVEN
 * BELOW MAY EVER BE CONNECTED TO ASK BUBBLES. Everything else in that account is
 * another brand's data and is ignored on sight — never stored, never matched,
 * never counted beyond a number in a sync report.
 *
 * Confirmed by Buff City Soap; every profile shows as Verified in Google
 * Business Profile. The store code is Buff City Soap's own store number.
 *
 * A STORE CODE IS NOT A WOVEN ID AND NOT AN ASK BUBBLES LOCATION ID. The
 * numbering systems overlap without agreeing (a known failure in
 * the sister brand's integration, where treating them as
 * interchangeable files reviews are filed against the wrong store with nothing
 * looking wrong). A Google location is linked to a store by Google's own
 * identifiers — an exact store code AND the street address — or by an
 * administrator's explicit confirmation. Never by arithmetic on a number from
 * another system.
 *
 * ADDING OR REMOVING A STORE is a reviewed change to THIS file AND a migration
 * for `public.google_review_locations`. `google-reviews-config.test.ts` fails if
 * this list and the migration's seed ever differ.
 */

export const GOOGLE_REVIEWS_BRAND = "buff_city_soap" as const;

export interface ApprovedGoogleStore {
  /** Buff City Soap's store number, exactly as Google Business Profile lists it. */
  readonly code: string;
  readonly displayName: string;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  /** Two-letter state. */
  readonly state: string;
  readonly postalCode: string;
}

export const APPROVED_GOOGLE_STORES: readonly ApprovedGoogleStore[] = [
  {
    code: "219",
    displayName: "Lee's Summit, MO",
    addressLine1: "2050 NW Lowenstein Dr",
    addressLine2: "Ste C",
    city: "Lee's Summit",
    state: "MO",
    postalCode: "64081",
  },
  {
    code: "225",
    displayName: "Sioux Falls, SD",
    addressLine1: "4025 W 41st St",
    addressLine2: null,
    city: "Sioux Falls",
    state: "SD",
    postalCode: "57106",
  },
  {
    code: "236",
    displayName: "Grand Island, NE",
    addressLine1: "3429 W 13th St",
    addressLine2: "Ste B",
    city: "Grand Island",
    state: "NE",
    postalCode: "68803",
  },
  {
    code: "264",
    displayName: "Omaha, NE",
    addressLine1: "7810 West Dodge Rd",
    addressLine2: null,
    city: "Omaha",
    state: "NE",
    postalCode: "68114",
  },
  {
    code: "338",
    displayName: "Sioux Falls, SD",
    addressLine1: "5902 E 18th St",
    addressLine2: null,
    city: "Sioux Falls",
    state: "SD",
    postalCode: "57110",
  },
  {
    code: "66",
    displayName: "Kearney, NE",
    addressLine1: "5210 2nd Ave",
    addressLine2: null,
    city: "Kearney",
    state: "NE",
    postalCode: "68847",
  },
  {
    code: "67",
    displayName: "Bellevue, NE",
    addressLine1: "10110 S 15th St",
    addressLine2: "Ste 104",
    city: "Bellevue",
    state: "NE",
    postalCode: "68123",
  },
];

/**
 * A Google location whose title names any of these is another brand's profile,
 * whatever its store code or address say. Matched case-insensitively on the
 * title with punctuation and spacing removed.
 */
export const OTHER_BRAND_TITLE_MARKERS: readonly string[] = ["suntancity", "suntan city", "sun tan city"];

export function approvedStoreByCode(code: string): ApprovedGoogleStore | undefined {
  return APPROVED_GOOGLE_STORES.find((store) => store.code === code);
}
