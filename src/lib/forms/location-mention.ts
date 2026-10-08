import { COMPANY_LOCATION_ABBREVIATIONS, COMPANY_LOCATION_NICKNAMES } from "@/config/company/locations";
import { COMPANY_LOCATIONS, locationById, locationNameKey, type CompanyLocation } from "@/lib/locations";

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
 * No fuzzy matching. A misspelt store is a question, not a guess.
 */

export interface LocationMention {
  readonly locationIds: readonly string[];
}

/** The words that say "this is a place", in any company's vocabulary. */
const PLACE_NOUNS = "salon|store|location|studio|shop|makery";

const ABBREVIATIONS = Object.entries(COMPANY_LOCATION_ABBREVIATIONS).map(([short, full]) => ({
  pattern: new RegExp(`\\b${short.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"),
  full: full.toLowerCase(),
}));

function key(text: string): string {
  let folded = ` ${locationNameKey(text)} `;
  for (const abbreviation of ABBREVIATIONS) folded = folded.replace(abbreviation.pattern, abbreviation.full);
  return folded
    .replace(/\bsaint\b/g, "st")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bparkway\b/g, "pkwy")
    .replace(/\s+/g, " ");
}

/** A roster name without its two-letter state prefix, when it has one. */
function localName(location: CompanyLocation): string {
  const prefix = location.state ? new RegExp(`^${location.state}\\s+`, "i") : null;
  return prefix && prefix.test(location.name) ? location.name.replace(prefix, "") : location.name;
}

const SHARED_CITIES: readonly string[] = (() => {
  const counts = new Map<string, number>();
  for (const location of COMPANY_LOCATIONS) {
    const words = key(localName(location)).trim().split(" ");
    for (let length = 1; length < words.length; length += 1) {
      const head = words.slice(0, length).join(" ");
      counts.set(head, (counts.get(head) ?? 0) + 1);
    }
  }
  const shared = [...counts].filter(([, count]) => count > 1).map(([head]) => head);
  return shared.filter((head) => !shared.some((other) => other !== head && other.startsWith(`${head} `)));
})();

/** Nicknames managers use for one location, keyed to its roster code. */
const SHORT_NAMES: Readonly<Record<string, string>> = COMPANY_LOCATION_NICKNAMES;

interface Alias {
  readonly phrase: string;
  readonly locationIds: readonly string[];
  readonly needsCue: boolean;
}

const ALIASES: readonly Alias[] = (() => {
  const aliases: Alias[] = [];
  const add = (phrase: string, locationIds: string[]) => {
    const trimmed = phrase.trim();
    if (!trimmed) return;
    aliases.push({ phrase: trimmed, locationIds, needsCue: true });
  };

  for (const location of COMPANY_LOCATIONS) {
    const full = key(location.name).trim();
    const local = key(localName(location)).trim();
    aliases.push({ phrase: full, locationIds: [location.id], needsCue: false });
    if (local !== full) add(local, [location.id]);
    const city = SHARED_CITIES.find((head) => local.startsWith(`${head} `));
    if (city) add(local.slice(city.length), [location.id]);
  }

  for (const [phrase, code] of Object.entries(SHORT_NAMES)) {
    const location = COMPANY_LOCATIONS.find((entry) => sameCode(entry.code, code));
    if (location) add(phrase, [location.id]);
  }

  return aliases.sort((a, b) => b.phrase.length - a.phrase.length);
})();

const CARRIES_ON = `${PLACE_NOUNS}|and|but|or|on|today|yesterday|tonight|this|last|at|she|he|they|i|we|for|with|where|when|while|because|so|again|during|after|before|around|since|until|was|is|has|had`;

const ROSTER_STATES = [
  ...new Set(
    COMPANY_LOCATIONS.map((location) => location.state?.toLowerCase()).filter(
      (state): state is string => Boolean(state),
    ),
  ),
];
const STATE_BEFORE = ROSTER_STATES.length > 0 ? new RegExp(`\\b(?:${ROSTER_STATES.join("|")})\\s+$`) : null;
const AT_BEFORE = /\b(?:at|in)\s+(?:the\s+)?$/;
const PLACE_AFTER = new RegExp(`^\\s*(?:${PLACE_NOUNS})\\b`);
const CARRIES_ON_AFTER = new RegExp(`^\\s*$|^\\s+(?:${CARRIES_ON})\\b`);

function cued(before: string, after: string): boolean {
  if ((STATE_BEFORE && STATE_BEFORE.test(before)) || PLACE_AFTER.test(after)) return true;
  return AT_BEFORE.test(before) && CARRIES_ON_AFTER.test(after);
}

const CITY_ENDS = `(?=\\s*$|\\s*[,.;:!?)]|\\s+(?:${CARRIES_ON})\\b)`;

const CITY_PATTERNS: readonly { pattern: RegExp; locationIds: readonly string[] }[] = SHARED_CITIES.map(
  (city) => {
    const words = city.split(" ").join("\\s+");
    const shorts = Object.entries(COMPANY_LOCATION_ABBREVIATIONS)
      .filter(([, full]) => full.toLowerCase() === city)
      .map(([short]) => short.toLowerCase());
    const spelled = shorts.length > 0 ? `(?:${words}|${shorts.join("|")})` : words;
    return {
      pattern: new RegExp(
        `(?:\\b(?:at|in)\\s+(?:the\\s+)?${spelled}${CITY_ENDS}|\\b${spelled}\\s+(?:${PLACE_NOUNS})\\b)`,
        "i",
      ),
      locationIds: COMPANY_LOCATIONS.filter((location) =>
        key(localName(location)).trim().startsWith(`${city} `),
      ).map((location) => location.id),
    };
  },
);

const NUMBER_MENTION = new RegExp(
  `(?:\\b(?:${PLACE_NOUNS})\\s*#?\\s*|#\\s*)([A-Za-z0-9][A-Za-z0-9-]{0,15})\\b`,
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

  let haystack = key(text);
  for (const alias of ALIASES) {
    const pattern = new RegExp(`(?<= )${alias.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?= )`, "g");
    let found = false;
    haystack = haystack.replace(pattern, (phrase, offset: number) => {
      const before = haystack.slice(0, offset);
      const after = haystack.slice(offset + phrase.length);
      if (alias.needsCue && !cued(before, after)) return phrase;
      found = true;
      return "_".repeat(phrase.length);
    });
    if (found) mentions.push({ locationIds: alias.locationIds });
  }

  const spaced = text.replace(/\s+/g, " ");
  for (const city of CITY_PATTERNS) {
    if (city.pattern.test(spaced)) mentions.push({ locationIds: city.locationIds });
  }

  return mentions;
}

export function rosterLocationName(id: string): string | null {
  return locationById(id)?.name ?? null;
}
