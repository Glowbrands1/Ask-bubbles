import { COMPANY_LOCATIONS, locationById, locationNameKey } from "@/lib/locations";

/**
 * ============================================================================
 * WHICH LOCATION THE MANAGER NAMED, READ FROM THEIR OWN WORDS
 * ============================================================================
 *
 * A CANDIDATE SET, NEVER A DECISION. This module says which roster locations a
 * mention could mean; `proposeLocation` intersects that with the locations the
 * actor's scope proves, and only then is anything filled in.
 *
 * Two readings, both against the configured roster only:
 *
 *   a store number   "store 12", "location #12", "#12" — matched to the
 *                    roster code exactly, or ignoring leading zeros
 *   a full name      the roster name, compared through `locationNameKey`
 *
 * No fuzzy matching. A misspelt store is a question, not a guess.
 */

export interface LocationMention {
  readonly locationIds: readonly string[];
}

const LOCATION_NOUNS = "location|store|shop|makery";
const NUMBER_MENTION = new RegExp(
  `(?:\\b(?:${LOCATION_NOUNS})\\s*#?\\s*|#\\s*)([A-Za-z0-9][A-Za-z0-9-]{0,15})\\b`,
  "gi",
);

function sameCode(a: string, b: string): boolean {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  return /^\d+$/.test(a) && /^\d+$/.test(b) && Number(a) === Number(b);
}

export function readLocationMentions(text: string): LocationMention[] {
  const mentions: LocationMention[] = [];

  for (const match of text.matchAll(NUMBER_MENTION)) {
    const typed = match[1]!;
    const hits = COMPANY_LOCATIONS.filter((location) => sameCode(location.code, typed));
    if (hits.length > 0) mentions.push({ locationIds: hits.map((location) => location.id) });
  }

  const haystack = ` ${locationNameKey(text)} `;
  for (const location of COMPANY_LOCATIONS) {
    const key = locationNameKey(location.name);
    if (key.length > 2 && haystack.includes(` ${key} `)) {
      mentions.push({ locationIds: [location.id] });
    }
  }

  return mentions;
}

export function rosterLocationName(id: string): string | null {
  return locationById(id)?.name ?? null;
}
