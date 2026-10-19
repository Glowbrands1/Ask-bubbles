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

/**
 * A roster name reduced to the words a manager would use for it.
 *
 * TWO NAMING STYLES, BOTH FOLLOWED FROM THE ROSTER ITSELF:
 *
 *   "TN Testville Downtown"            state PREFIX — the prefix is dropped.
 *   "Kearney, NE"                      city, then the state — the state is dropped.
 *   "Omaha, NE (West Dodge Rd)"        …and the road that tells two stores of one
 *                                      city apart is kept after the city.
 *
 * Buff City Soap's roster is the second style. This reader was ported from a
 * platform whose roster was all the first, so "Kearney", "Grand Island" and
 * "Omaha West Dodge" matched nothing — only "Kearney NE" did — and a form for
 * somebody at Kearney carried no location at all.
 */
function localName(location: CompanyLocation): string {
  const { city, qualifier } = splitName(location);
  return qualifier ? `${city} ${qualifier}` : city;
}

/** "Omaha, NE (West Dodge Rd)" → city "Omaha", qualifier "West Dodge Rd". */
function splitName(location: CompanyLocation): { city: string; qualifier: string | null } {
  const name = location.name;
  const parenthetical = /\(([^)]*)\)/.exec(name)?.[1]?.trim() || null;
  const withoutParens = name.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  const trailingState = /\s*,\s*[A-Za-z]{2}\s*$/;
  if (parenthetical || trailingState.test(withoutParens)) {
    return { city: withoutParens.replace(trailingState, "").trim(), qualifier: parenthetical };
  }
  const prefix = location.state ? new RegExp(`^${location.state}\\s+`, "i") : null;
  return {
    city: prefix && prefix.test(withoutParens) ? withoutParens.replace(prefix, "") : withoutParens,
    qualifier: null,
  };
}

const DIRECTIONALS = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw", "north", "south", "east", "west"]);
const ROAD_SUFFIXES = new Set([
  "rd", "road", "st", "ave", "avenue", "blvd", "boulevard", "dr", "drive", "hwy", "highway", "pkwy", "ln", "lane", "way",
]);

/**
 * The ways a manager shortens a road: "West Dodge Rd" → "west dodge rd",
 * "west dodge", "dodge rd", "dodge". Derived from the roster's own qualifier,
 * never typed in by hand. `core` is the road's name alone, when it has one that
 * is not just a number ("W 41st St" has none, and "41st" alone is a date).
 */
function qualifierVariants(qualifier: string): { variants: string[]; core: string | null } {
  const words = key(qualifier).trim().split(" ").filter(Boolean);
  const withoutDirection = words.filter((word, index) => !(index === 0 && DIRECTIONALS.has(word)));
  const dropSuffix = (list: string[]) =>
    list.length > 1 && ROAD_SUFFIXES.has(list[list.length - 1]!) ? list.slice(0, -1) : list;
  const variants = [
    ...new Set([words, dropSuffix(words), withoutDirection, dropSuffix(withoutDirection)].map((list) => list.join(" "))),
  ].filter(Boolean);
  const coreWords = dropSuffix(withoutDirection).filter((word) => !/\d/.test(word));
  return { variants, core: coreWords.length > 0 ? coreWords.join(" ") : null };
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
  const add = (phrase: string, locationIds: string[], needsCue = true) => {
    const trimmed = phrase.trim();
    if (!trimmed) return;
    aliases.push({ phrase: trimmed, locationIds, needsCue });
  };

  /* Every store in a city, so a city two stores share names both of them. */
  const byCity = new Map<string, string[]>();

  for (const location of COMPANY_LOCATIONS) {
    const full = key(location.name).trim();
    const local = key(localName(location)).trim();
    aliases.push({ phrase: full, locationIds: [location.id], needsCue: false });
    if (local !== full) add(local, [location.id]);
    const city = SHARED_CITIES.find((head) => local.startsWith(`${head} `));
    if (city) add(local.slice(city.length), [location.id]);

    const parts = splitName(location);
    const cityKey = key(parts.city).trim();
    if (cityKey && cityKey !== full) byCity.set(cityKey, [...(byCity.get(cityKey) ?? []), location.id]);

    if (parts.qualifier) {
      const { variants, core } = qualifierVariants(parts.qualifier);
      for (const variant of variants) {
        // "omaha west dodge" is specific enough to stand without a cue.
        add(`${cityKey} ${variant}`, [location.id], false);
        // The road on its own is a place only where the sentence says so ("at Dodge").
        if (variant.includes(" ") || variant === core) add(variant, [location.id]);
      }
      if (core) add(`${cityKey} ${core}`, [location.id], false);
    }
  }

  for (const [cityKey, ids] of byCity) add(cityKey, [...new Set(ids)]);

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
const ROSTER_STATES_PATTERN = ROSTER_STATES.join("|");
const STATE_BEFORE = ROSTER_STATES.length > 0 ? new RegExp(`\\b(?:${ROSTER_STATES.join("|")})\\s+$`) : null;
const AT_BEFORE = /\b(?:at|in)\s+(?:the\s+)?$/;
/** "at Kearney and Bellevue": the second store in a list is a place too, or it is silently dropped. */
const AT_LIST_BEFORE = /\b(?:at|in)\s+(?:the\s+)?[^|]{1,40}?\s+(?:and|or)\s+(?:the\s+)?$/;
const PLACE_AFTER = new RegExp(`^\\s*(?:${PLACE_NOUNS})\\b`);
const CARRIES_ON_AFTER = new RegExp(`^\\s*$|^\\s*\\||^\\s+(?:${CARRIES_ON})\\b`);

/** "use Kearney", "location is Kearney", "change it to Kearney": the manager is choosing a place. */
const CHOOSING_BEFORE =
  /\b(?:use|using|choose|select|pick|go with|make it|file (?:it )?(?:for|under|against)|(?:change|switch|set|move)(?: it| the location| the store)? to|(?:location|store)\s*(?:is|:|=|should be|to))\s+(?:the\s+)?$/;
/** "Kearney as the location", "Kearney is the store": the same, said the other way round. */
const CHOSEN_AFTER = new RegExp(`^\\s+(?:as|is|for)\\s+(?:the\\s+|her\\s+|his\\s+|their\\s+)?(?:${PLACE_NOUNS})\\b`);

function cued(before: string, after: string): boolean {
  if ((STATE_BEFORE && STATE_BEFORE.test(before)) || PLACE_AFTER.test(after)) return true;
  if (CHOOSING_BEFORE.test(before) || CHOSEN_AFTER.test(after)) return true;
  // The whole turn (or sentence) is the place: the answer to "which location?".
  if (before.split("|").pop()!.trim() === "" && after.split("|")[0]!.trim() === "") return true;
  return (AT_BEFORE.test(before) || AT_LIST_BEFORE.test(before)) && CARRIES_ON_AFTER.test(after);
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

/**
 * The manager's sentence with its punctuation kept as a BOUNDARY. `key` folds
 * commas away, which is right for a roster name ("Kearney, NE") and wrong for a
 * sentence: "at Lee's Summit, out of dress code" lost the comma that says the
 * place has ended, so "at <place>" was never recognised as one. A comma before
 * a roster state ("Kearney, NE") is still part of the name.
 */
function withBoundaries(text: string): string {
  const stateComma = ROSTER_STATES_PATTERN ? new RegExp(`,\\s*(?=(?:${ROSTER_STATES_PATTERN})\\b)`, "gi") : null;
  const masked = stateComma ? text.replace(stateComma, " ") : text;
  return masked.replace(/[,;:!?\n]|\.(?=\s|$)/g, " | ");
}

export function readLocationMentions(text: string): LocationMention[] {
  const mentions: LocationMention[] = [];

  for (const match of text.matchAll(NUMBER_MENTION)) {
    const typed = match[1]!;
    const hits = COMPANY_LOCATIONS.filter((location) => sameCode(location.code, typed));
    if (hits.length > 0) mentions.push({ locationIds: hits.map((location) => location.id) });
  }

  let haystack = key(withBoundaries(text));
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
