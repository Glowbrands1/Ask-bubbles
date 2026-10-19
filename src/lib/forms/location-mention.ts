import { COMPANY_LOCATION_ABBREVIATIONS, COMPANY_LOCATION_NICKNAMES } from "@/config/company/locations";
import { locationById } from "@/lib/locations";
import { buildStoreIndex, readStoreMentions, type StoreIndex, type StoreMention } from "@/lib/stores/resolver";


/**
 * ============================================================================
 * WHICH LOCATION THE MANAGER NAMED, READ FROM THEIR OWN WORDS
 * ============================================================================
 *
 * A CANDIDATE SET, NEVER A DECISION. This module says which roster locations a
 * mention could mean; `proposeLocation` intersects that with the locations the
 * AUTHENTICATED SCOPE proves, and `POST /api/forms/instances` re-authorizes
 * whatever comes back. Nothing here widens who may file where.
 *
 * THE REFERENCE PLATFORM'S READER, ON THIS ROSTER. The algorithm is the one the
 * reference platform's forms chat proved in production (state prefix, shared
 * city, "at … today" cues, store numbers); only the roster it reads is this
 * company's `COMPANY_LOCATIONS`. Nicknames and abbreviations are company
 * data, not algorithm: they live in `COMPANY_LOCATION_NICKNAMES` and
 * `COMPANY_LOCATION_ABBREVIATIONS` beside the roster.
 *
 * NORMALIZED THE WAY THE ROSTER IS. `locationNameKey` folds case, spacing,
 * `&`/`and`, commas and periods, so "Testville Downtown." and "testville
 * downtown" are one location. On top of it, only the abbreviations managers
 * actually type: St/Saint, Pkwy/Parkway, St/Street.
 *
 * CONSERVATIVE ABOUT SHORT NAMES. A city on its own is also a person's name, a
 * road or an idiom. So anything short of the full roster name counts only
 * where the sentence says it is the location: behind the state prefix a roster
 * name carries ("TN Testville Downtown"), before "store"/"location" ("the
 * Downtown store"), or after "at"/"in" when the sentence then carries on as a
 * sentence ("at Downtown today"). "From" is not a cue: where somebody came from
 * is not where the form is filed. A city several locations share is a mention
 * of ALL of them, which is what makes it ambiguous rather than wrong — but only
 * where it stands alone as a place.
 *
 * NUMBERS. "store 12", "location #12", "#12" — matched to the roster code
 * exactly, or ignoring leading zeros.
 *
 * A MISSPELT STORE IS A QUESTION, NOT A GUESS. A typo or an initialism
 * ("Kearny", "GI") comes back flagged `confirm`; the caller asks before using it.
 *
 * THE READING ITSELF LIVES IN `@/lib/stores/resolver`, shared with form
 * autofill, so one phrase means one store everywhere. This module keeps the
 * shape `proposeLocation` consumes.
 */

export type LocationMention = StoreMention;

export interface LocationReading {
  readonly mentions: LocationMention[];
  /** Store-shaped references ("Store 102") that no registered store answers to. */
  readonly unmatched: string[];
}

/** The registered roster with the company's reviewed nicknames and abbreviations. */
export const ROSTER_STORE_INDEX: StoreIndex = buildStoreIndex({
  nicknames: COMPANY_LOCATION_NICKNAMES,
  abbreviations: COMPANY_LOCATION_ABBREVIATIONS,
});

export function readLocation(text: string, index: StoreIndex = ROSTER_STORE_INDEX): LocationReading {
  return readStoreMentions(text, index);
}

export function readLocationMentions(text: string, index: StoreIndex = ROSTER_STORE_INDEX): LocationMention[] {
  return readStoreMentions(text, index).mentions;
}

export function rosterLocationName(id: string): string | null {
  return locationById(id)?.name ?? null;
}
