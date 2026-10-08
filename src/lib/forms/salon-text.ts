import { COMPANY_LOCATIONS, locationNameKey as storeNameKey, type CompanyLocation } from "@/lib/locations";

/**
 * ============================================================================
 * A SALON AS A MANAGER TYPES IT
 * ============================================================================
 *
 * "store 12", "location 12", "downtown", "TN Testville Downtown", "#12".
 * None of these should be refused, and none should be rewritten into a
 * location the manager did not mean. (The module keeps the reference
 * platform's name; it reads this company's `COMPANY_LOCATIONS`.)
 *
 * TWO OUTCOMES, AND NO THIRD:
 *
 *   A ROSTER MATCH, which must be UNIQUE. The whole name ("ks lawrence"), the
 *   name without its state prefix ("lawrence"), or the salon number, padded
 *   compared by number so leading zeros do not matter ("12", "#012",
 *   "store 12"). Compared through `locationNameKey`, so case, spacing and
 *   punctuation do not matter. The display value is the roster's name.
 *
 *   ANYTHING ELSE IS KEPT AS TYPED, cleaned: whitespace collapsed, words
 *   capitalised, role abbreviations in capitals. "store 12" that is not a
 *   roster code prints as "Store 12" — the manager's words, legible — rather
 *   than as a guess at which location they meant. The field stays editable.
 */

const SMALL_WORDS = new Set(["in", "of", "and", "the", "at", "for"]);

const ABBREVIATIONS = new Set([
  "sd", "asd", "tsd", "dm", "tc",
  ...COMPANY_LOCATIONS.map((location) => location.state?.toLowerCase()).filter(
    (state): state is string => Boolean(state),
  ),
]);

/** Capitalises each word, keeping known abbreviations in capitals. */
export function tidyWords(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      // "Salon Director in Training", not "... In Training".
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      if (ABBREVIATIONS.has(lower)) return lower.toUpperCase();
      // Leave words the manager already capitalised mid-word ("McKenzie").
      if (/[A-Z]/.test(word.slice(1))) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function withoutPrefix(location: CompanyLocation): string {
  if (!location.state) return location.name;
  return location.name.replace(new RegExp(`^${location.state}\\s+`, "i"), "");
}

const NUMBERED = /^(?:(?:salon|store|location|loc|shop|makery)\s*)?#?\s*(\d{1,6})$/;

/**
 * The roster location a typed phrase names, when it names exactly one.
 */
export function rosterSalonFor(text: string): CompanyLocation | null {
  const key = storeNameKey(
    text.replace(/^(?:the|our)\s+/i, "").replace(/\s+(?:salon|store|location|shop|makery)$/i, ""),
  );
  if (!key) return null;

  const number = NUMBERED.exec(key)?.[1];
  if (number) {
    const hits = COMPANY_LOCATIONS.filter(
      (location) => /^\d+$/.test(location.code) && Number(location.code) === Number(number),
    );
    return hits.length === 1 ? hits[0]! : null;
  }

  const byName = COMPANY_LOCATIONS.filter(
    (location) => storeNameKey(location.name) === key || storeNameKey(withoutPrefix(location)) === key,
  );
  return byName.length === 1 ? byName[0]! : null;
}

/** The location as it should print: the roster name when unique, otherwise the tidied text. */
export function resolveSalonText(text: string): string | null {
  const cleaned = text
    .replace(/^[\s,:;-]+|[\s,.;:!?]+$/g, "")
    .replace(/^(?:the|our)\s+/i, "")
    .trim();
  if (!cleaned) return null;
  const salon = rosterSalonFor(cleaned);
  if (salon) return salon.name;
  return tidyWords(cleaned);
}

/**
 * A regular-expression fragment matching a location as typed: a numbered one
 * ("store 12", "location #12", "#12") or a roster name, with or without its
 * state prefix, longest first so "Testville Downtown" is not read as
 * "Testville".
 */
export const SALON_PHRASE: string = (() => {
  const names = COMPANY_LOCATIONS.flatMap((location) => [location.name, withoutPrefix(location)])
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .sort((a, b) => b.length - a.length);
  const named = names.length > 0 ? `|${names.join("|")}` : "";
  return `(?:(?:salon|store|location|loc|shop|makery)\\s*#?\\s*\\d{1,6}|#\\s?\\d{1,6}${named})`;
})();
