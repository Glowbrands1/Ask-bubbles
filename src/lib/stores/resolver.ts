import { editDistance } from "@/lib/forms/employee-match";
import { COMPANY_LOCATIONS, locationNameKey, type CompanyLocation } from "@/lib/locations";

/**
 * ============================================================================
 * THE STORE RESOLVER — ONE READER OF "WHICH STORE DID THEY MEAN"
 * ============================================================================
 *
 * Ask Bubbles chat, form proposals and form autofill all read a store out of
 * somebody's words. They read it HERE, so a store is never recognised in one
 * place and refused in another.
 *
 * THE REGISTERED RECORDS ARE THE ONLY SOURCE. Every phrase this module can
 * match is derived from a registered store (`COMPANY_LOCATIONS`: its code, its
 * name, its state, its street qualifier), from the Woven names and numbers a
 * person has MAPPED to that store (`woven_location_map`, passed in as
 * `extraAliases`), or from the reviewed company nicknames and abbreviations.
 * Nothing is invented: a phrase that names no registered store resolves to
 * nothing, and the caller says so.
 *
 * THREE OUTCOMES, AND NO GUESSING BETWEEN THEM:
 *
 *   resolved   exactly one store. `confirm` is true when the match was a typo
 *              or an initialism ("Kearny", "GI"): the caller asks before using
 *              it, the way employee names are.
 *   ambiguous  more than one store ("Sioux Falls", or a number two systems use
 *              for different stores). Every candidate is returned; the caller
 *              asks.
 *   not_found  no registered store. The caller explains that.
 *
 * NUMBERS. A store number is the registered code. Woven numbers its stores
 * differently (Woven 123 is store 236; Woven 225 is the Omaha store, not
 * store 225), so a Woven number counts only through a person-reviewed
 * mapping, and a number that two systems give to different stores is
 * ambiguous rather than resolved.
 *
 * Pure and browser-safe: the index is built from what the caller passes.
 */

export type StoreMatchVia =
  | "code"
  | "name"
  | "alias"
  | "woven_name"
  | "woven_number"
  | "partial"
  | "initials"
  | "fuzzy";

/** A phrase or number a registered store is also known by, from a reviewed source. */
export interface StoreAlias {
  readonly storeId: string;
  readonly kind: "woven_name" | "woven_number";
  readonly text: string;
}

export type StoreResolution =
  | {
      kind: "resolved";
      store: CompanyLocation;
      via: StoreMatchVia;
      /** True when the match was inferred (typo, initialism): ask before using it. */
      confirm: boolean;
      matched: string;
    }
  | {
      kind: "ambiguous";
      candidates: readonly CompanyLocation[];
      matched: string;
      reason: "multiple" | "number_collision";
      numbering?: StoreNumbering;
    }
  | { kind: "not_found"; query: string };

/**
 * One number, two numbering systems. Buff City Soap's own store numbers are
 * primary; Woven's numbers are secondary aliases, honoured only where a person
 * mapped them. Where they disagree about a number the caller says so.
 */
export interface StoreNumbering {
  readonly number: string;
  /** Registered (Buff City Soap) stores with this number. */
  readonly buff: readonly string[];
  /** Stores a person mapped from a Woven location with this number. */
  readonly woven: readonly string[];
}

export interface StoreMention {
  readonly locationIds: readonly string[];
  /** The mention was inferred (typo, initialism) and needs the manager's yes. */
  readonly confirm?: boolean;
  /** Two systems number different stores the same. */
  readonly collision?: boolean;
  /** For a collision: the number typed and which stores each numbering system gives it to. */
  readonly numbering?: StoreNumbering;
  /** What the manager typed for it. */
  readonly matched?: string;
}

export interface StoreReading {
  readonly mentions: StoreMention[];
  /** Things the manager called a store that no registered store answers to, as typed. */
  readonly unmatched: string[];
}

interface IndexedAlias {
  readonly phrase: string;
  readonly locationIds: readonly string[];
  readonly needsCue: boolean;
  readonly via: StoreMatchVia;
}

export interface StoreIndex {
  readonly stores: readonly CompanyLocation[];
  readonly aliases: readonly IndexedAlias[];
  readonly byPhrase: ReadonlyMap<string, IndexedAlias>;
  /** Woven store number → store ids, from reviewed mappings only. */
  readonly wovenNumbers: ReadonlyMap<string, readonly string[]>;
  readonly states: readonly string[];
  readonly sharedCities: readonly string[];
  readonly abbreviations: ReadonlyArray<{ pattern: RegExp; full: string }>;
}

export interface StoreIndexSources {
  readonly stores?: readonly CompanyLocation[];
  /** Reviewed nicknames, keyed to a store code: "downtown" → "101". */
  readonly nicknames?: Readonly<Record<string, string>>;
  /** Reviewed word abbreviations folded before matching: "kc" → "kansas city". */
  readonly abbreviations?: Readonly<Record<string, string>>;
  readonly extraAliases?: readonly StoreAlias[];
}

/** The words that say "this is a place", in any company's vocabulary. */
export const PLACE_NOUNS = "salon|store|location|studio|shop|makery";

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function sameCode(a: string, b: string): boolean {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  return /^\d+$/.test(a) && /^\d+$/.test(b) && Number(a) === Number(b);
}

/** How a store reads in anything a person sees: its registered name and number. */
export function describeStore(store: Pick<CompanyLocation, "name" | "code">): string {
  return `${store.name} (Store ${store.code})`;
}

function foldKey(text: string, abbreviations: StoreIndex["abbreviations"]): string {
  let folded = ` ${locationNameKey(text).replace(/[()?!;:"“”]/g, " ")} `;
  for (const abbreviation of abbreviations) folded = folded.replace(abbreviation.pattern, abbreviation.full);
  return folded
    .replace(/\bsaint\b/g, "st")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bparkway\b/g, "pkwy")
    .replace(/\s+/g, " ");
}

interface ParsedName {
  /** Name without a state or a street qualifier: "Kearney", "Sioux Falls". */
  readonly city: string;
  /** "W 41st St" from "Sioux Falls, SD (W 41st St)". */
  readonly qualifier: string | null;
}

/**
 * A registered name read either way round — "NE Kearney" or "Kearney, NE" —
 * with an optional "(W 41st St)" qualifier. Company data uses both.
 */
export function parseStoreName(store: Pick<CompanyLocation, "name" | "state">): ParsedName {
  let base = store.name.trim();
  let qualifier: string | null = null;
  const qualified = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(base);
  if (qualified) {
    base = qualified[1]!.trim();
    qualifier = qualified[2]!.trim() || null;
  }
  if (store.state) {
    const state = escape(store.state);
    base = base.replace(new RegExp(`\\s*,?\\s+${state}$`, "i"), "").replace(new RegExp(`^${state}\\s+`, "i"), "");
  }
  return { city: base.replace(/,\s*$/, "").trim(), qualifier };
}

const GENERIC_WORDS = new Set(
  `the this that my our your a an same other new one which what home work front back main ${PLACE_NOUNS.replace(/\|/g, " ")}`.split(
    " ",
  ),
);

export function buildStoreIndex(sources: StoreIndexSources = {}): StoreIndex {
  const stores = sources.stores ?? COMPANY_LOCATIONS;
  const abbreviations = Object.entries(sources.abbreviations ?? {}).map(([short, full]) => ({
    pattern: new RegExp(`\\b${escape(short.toLowerCase())}\\b`, "g"),
    full: full.toLowerCase(),
  }));
  const key = (text: string) => foldKey(text, abbreviations);

  const states = [
    ...new Set(stores.map((store) => store.state?.toLowerCase()).filter((state): state is string => Boolean(state))),
  ];

  const parsed = new Map(stores.map((store) => [store.id, parseStoreName(store)]));
  const cityOf = (store: CompanyLocation) => key(parsed.get(store.id)!.city).trim();

  // A leading run of words several stores share ("testville") — a city, not a store.
  const counts = new Map<string, number>();
  for (const store of stores) {
    const words = cityOf(store).split(" ");
    for (let length = 1; length < words.length; length += 1) {
      const head = words.slice(0, length).join(" ");
      counts.set(head, (counts.get(head) ?? 0) + 1);
    }
  }
  const shared = [...counts].filter(([, count]) => count > 1).map(([head]) => head);
  const sharedCities = shared.filter((head) => !shared.some((other) => other !== head && other.startsWith(`${head} `)));

  const merged = new Map<string, { ids: Set<string>; needsCue: boolean; via: StoreMatchVia }>();
  const add = (phrase: string, storeId: string, needsCue: boolean, via: StoreMatchVia) => {
    const trimmed = phrase.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    const existing = merged.get(trimmed);
    if (!existing) {
      merged.set(trimmed, { ids: new Set([storeId]), needsCue, via });
      return;
    }
    existing.ids.add(storeId);
    existing.needsCue = existing.needsCue && needsCue;
    if (existing.via === "initials" && via !== "initials") existing.via = via;
  };

  for (const store of stores) {
    const { qualifier } = parsed.get(store.id)!;
    const city = cityOf(store);
    const state = store.state?.toLowerCase() ?? null;
    const q = qualifier ? key(qualifier).trim() : null;

    add(key(store.name).trim(), store.id, false, "name");
    add(city, store.id, true, "name");
    if (state) {
      add(`${city} ${state}`, store.id, false, "name");
      add(`${state} ${city}`, store.id, false, "name");
    }
    if (q) {
      add(`${city} ${q}`, store.id, false, "name");
      if (state) add(`${state} ${city} ${q}`, store.id, false, "name");
    }
    const head = sharedCities.find((candidate) => city.startsWith(`${candidate} `));
    if (head) add(city.slice(head.length), store.id, true, "name");

    const words = city.split(" ");
    if (words.length > 1) add(words.map((word) => word[0]).join(""), store.id, true, "initials");
  }

  for (const [phrase, code] of Object.entries(sources.nicknames ?? {})) {
    const store = stores.find((entry) => sameCode(entry.code, code));
    if (store) add(key(phrase).trim(), store.id, true, "alias");
  }

  const wovenNumbers = new Map<string, string[]>();
  const known = new Set(stores.map((store) => store.id));
  for (const alias of sources.extraAliases ?? []) {
    if (!known.has(alias.storeId)) continue;
    if (alias.kind === "woven_number") {
      const number = alias.text.trim();
      if (!number) continue;
      const ids = wovenNumbers.get(number) ?? [];
      if (!ids.includes(alias.storeId)) ids.push(alias.storeId);
      wovenNumbers.set(number, ids);
      continue;
    }
    const full = key(alias.text).trim();
    add(full, alias.storeId, full.split(" ").length < 2, "woven_name");
    const [first, ...rest] = full.split(" ");
    if (first && rest.length > 0 && states.includes(first)) {
      add(rest.join(" "), alias.storeId, rest.length < 2, "woven_name");
    }
  }

  const aliases: IndexedAlias[] = [...merged].map(([phrase, entry]) => ({
    phrase,
    locationIds: [...entry.ids],
    needsCue: entry.needsCue,
    via: entry.via,
  }));
  aliases.sort((a, b) => b.phrase.length - a.phrase.length);

  return {
    stores,
    aliases,
    byPhrase: new Map(aliases.map((alias) => [alias.phrase, alias])),
    wovenNumbers,
    states,
    sharedCities,
    abbreviations,
  };
}

/** The roster as it ships — no Woven mappings. What synchronous callers use. */
let defaultIndex: StoreIndex | null = null;
export function defaultStoreIndex(sources?: { nicknames?: StoreIndexSources["nicknames"]; abbreviations?: StoreIndexSources["abbreviations"] }): StoreIndex {
  if (sources) return buildStoreIndex({ ...sources });
  return (defaultIndex ??= buildStoreIndex());
}

function storesById(index: StoreIndex, ids: readonly string[]): CompanyLocation[] {
  return ids.map((id) => index.stores.find((store) => store.id === id)).filter((store): store is CompanyLocation => Boolean(store));
}

/** Store ids a typed number could mean, and whether two systems disagree about it. */
function idsForNumber(
  index: StoreIndex,
  typed: string,
): { ids: string[]; collision: boolean; via: StoreMatchVia; numbering: StoreNumbering } {
  const registered = index.stores.filter((store) => sameCode(store.code, typed)).map((store) => store.id);
  const woven = [...index.wovenNumbers]
    .filter(([number]) => sameCode(number, typed))
    .flatMap(([, ids]) => ids);
  const ids = [...new Set([...registered, ...woven])];
  const collision = registered.length > 0 && woven.some((id) => !registered.includes(id));
  return {
    ids,
    collision,
    via: registered.length > 0 ? "code" : "woven_number",
    numbering: { number: typed, buff: registered, woven: [...new Set(woven)] },
  };
}

const NUMBERED = /^(?:(?:salon|store|location|loc|shop|makery|studio)\s*)?#?\s*([A-Za-z0-9][A-Za-z0-9-]{0,15})$/i;

function fuzzy(query: string, index: StoreIndex): { ids: string[]; phrase: string } | null {
  if (query.length < 5) return null;
  let best = Infinity;
  let hits: IndexedAlias[] = [];
  for (const alias of index.aliases) {
    if (alias.via === "initials" || alias.phrase.length < 5) continue;
    if (alias.phrase[0] !== query[0]) continue;
    const shorter = Math.min(query.length, alias.phrase.length);
    const limit = shorter >= 9 ? 2 : 1;
    const distance = editDistance(query, alias.phrase);
    if (distance === 0 || distance > limit) continue;
    if (distance < best) {
      best = distance;
      hits = [alias];
    } else if (distance === best) hits.push(alias);
  }
  if (hits.length === 0) return null;
  return { ids: [...new Set(hits.flatMap((alias) => alias.locationIds))], phrase: hits[0]!.phrase };
}

function partial(query: string, index: StoreIndex): string[] {
  const words = query.split(" ").filter((word) => word.length >= 4 && !GENERIC_WORDS.has(word) && !index.states.includes(word));
  if (words.length === 0 || words.length !== query.split(" ").length) return [];
  const ids = new Set<string>();
  for (const alias of index.aliases) {
    if (alias.via === "initials") continue;
    const tokens = alias.phrase.split(" ");
    if (words.every((word) => tokens.includes(word))) for (const id of alias.locationIds) ids.add(id);
  }
  return [...ids];
}

/**
 * The store a typed phrase names — the whole phrase, as in an autofill field or
 * a menu answer. For a sentence use `readStoreMentions`.
 */
export function resolveStoreText(query: string, index: StoreIndex = defaultStoreIndex()): StoreResolution {
  const typed = query.replace(/^[\s,:;-]+|[\s,.;:!?]+$/g, "").trim();
  if (!typed) return { kind: "not_found", query };

  const settle = (ids: readonly string[], via: StoreMatchVia, confirm: boolean, matched: string, numbering?: StoreNumbering): StoreResolution => {
    const candidates = storesById(index, ids);
    if (candidates.length === 1) return { kind: "resolved", store: candidates[0]!, via, confirm, matched };
    if (candidates.length > 1) {
      return { kind: "ambiguous", candidates, matched, reason: numbering ? "number_collision" : "multiple", ...(numbering ? { numbering } : {}) };
    }
    return { kind: "not_found", query };
  };

  const stripped = typed.replace(/^(?:the|our)\s+/i, "");
  const numbered = NUMBERED.exec(stripped);
  if (numbered) {
    const token = numbered[1]!;
    const labelled = stripped !== token;
    // "12", "store 12", "#12": a number. "store kearney" is a name, handled below.
    if (/^\d+$/.test(token) || (labelled && /\d/.test(token))) {
      const found = idsForNumber(index, token);
      if (found.ids.length > 0) return settle(found.ids, found.via, false, typed, found.collision ? found.numbering : undefined);
      return { kind: "not_found", query };
    }
  }

  const key = foldKey(
    typed.replace(/^(?:the|our)\s+/i, "").replace(new RegExp(`\\s+(?:${PLACE_NOUNS})$`, "i"), "").replace(new RegExp(`^(?:${PLACE_NOUNS})\\s+`, "i"), ""),
    index.abbreviations,
  ).trim();
  if (!key) return { kind: "not_found", query };

  const exact = index.byPhrase.get(key);
  if (exact) return settle(exact.locationIds, exact.via === "initials" ? "initials" : exact.via, exact.via === "initials", typed);

  const parts = partial(key, index);
  if (parts.length > 0) return settle(parts, "partial", false, typed);

  const close = fuzzy(key, index);
  if (close) return settle(close.ids, "fuzzy", true, typed);

  return { kind: "not_found", query };
}

/**
 * Whether a phrase IS a registered store's name — the full name, the city with
 * its state, a street-qualified name or a reviewed alias — in two or more
 * words. A capitalised pair like "Grand Island" is a place, not an employee. A
 * single word ("Kearney") is never decided here: it is also a surname.
 */
export function isStoreName(phrase: string, index: StoreIndex = defaultStoreIndex()): boolean {
  const key = foldKey(phrase, index.abbreviations).trim();
  if (key.split(" ").length < 2) return false;
  const alias = index.byPhrase.get(key);
  return Boolean(alias && alias.via !== "initials");
}

/* ------------------------------------------------------------ in a sentence */

const CARRIES_ON = `${PLACE_NOUNS}|and|but|or|on|today|yesterday|tonight|this|last|at|she|he|they|i|we|for|with|where|when|while|because|so|again|during|after|before|around|since|until|was|is|has|had`;

const AT_BEFORE = /\b(?:at|in)\s+(?:the\s+)?$/;
const PLACE_AFTER = new RegExp(`^\\s*(?:${PLACE_NOUNS})\\b`);
const CARRIES_ON_AFTER = new RegExp(`^\\s*$|^\\s+(?:${CARRIES_ON})\\b`);

function cued(index: StoreIndex, before: string, after: string): boolean {
  const stateBefore = index.states.length > 0 ? new RegExp(`\\b(?:${index.states.join("|")})\\s+$`) : null;
  if ((stateBefore && stateBefore.test(before)) || PLACE_AFTER.test(after)) return true;
  return AT_BEFORE.test(before) && CARRIES_ON_AFTER.test(after);
}

const NUMBER_MENTION = new RegExp(
  `(?:\\b(?:${PLACE_NOUNS})\\s*(?:(?:is|are|was)\\s+)?(?:(?:number|no\\.?|num\\.?)\\s*)?#?\\s*|#\\s*)([A-Za-z0-9][A-Za-z0-9-]{0,15})\\b`,
  "gi",
);

const SPAN_BEFORE_NOUN = new RegExp(
  `\\b(?:at|in)\\s+(?:the\\s+)?([A-Za-z0-9][A-Za-z0-9'’. -]{2,38}?)\\s+(?:${PLACE_NOUNS})\\b`,
  "gi",
);
const SPAN_AT_END = new RegExp(
  `\\b(?:at|in)\\s+(?:the\\s+)?([A-Za-z][A-Za-z0-9'’.-]*(?:\\s+[A-Za-z][A-Za-z0-9'’.-]*){0,2})(?=\\s*[,.;:!?)]|\\s*$|\\s+(?:${CARRIES_ON})\\b)`,
  "gi",
);

/**
 * Every store a piece of text names, and every store-shaped reference it makes
 * that no registered store answers to.
 *
 * CONSERVATIVE ABOUT SHORT NAMES. A city alone is also a person's name or an
 * idiom, so anything short of a full registered name counts only where the
 * sentence says it is a store: behind a state prefix ("NE Kearney"), before
 * "store"/"location" ("the Kearney store"), or after "at"/"in" when the
 * sentence then ends or carries on ("at Kearney today"). "From" is not a cue.
 */
export function readStoreMentions(text: string, index: StoreIndex = defaultStoreIndex()): StoreReading {
  const mentions: StoreMention[] = [];
  const unmatched: string[] = [];

  for (const match of text.matchAll(NUMBER_MENTION)) {
    const typed = match[1]!;
    const found = idsForNumber(index, typed);
    if (found.ids.length > 0) {
      mentions.push({
        locationIds: found.ids,
        collision: found.collision,
        ...(found.collision ? { numbering: found.numbering } : {}),
        matched: match[0].trim(),
      });
    } else if (/^\d+$/.test(typed)) {
      unmatched.push(match[0].replace(/^\s+/, "").trim());
    }
  }

  let haystack = foldKey(text, index.abbreviations);
  for (const alias of index.aliases) {
    const pattern = new RegExp(`(?<= )${escape(alias.phrase)}(?= )`, "g");
    let found = false;
    haystack = haystack.replace(pattern, (phrase, offset: number) => {
      const before = haystack.slice(0, offset);
      const after = haystack.slice(offset + phrase.length);
      if (alias.needsCue && !cued(index, before, after)) return phrase;
      found = true;
      return "_".repeat(phrase.length);
    });
    if (found) {
      mentions.push({ locationIds: alias.locationIds, confirm: alias.via === "initials", matched: alias.phrase });
    }
  }

  // A city several stores share, said where it stands alone as a place.
  const spaced = text.replace(/\s+/g, " ");
  for (const city of index.sharedCities) {
    const words = city.split(" ").join("\\s+");
    const pattern = new RegExp(`(?:\\b(?:at|in)\\s+(?:the\\s+)?${words}(?=\\s*$|\\s*[,.;:!?)]|\\s+(?:${CARRIES_ON})\\b)|\\b${words}\\s+(?:${PLACE_NOUNS})\\b)`, "i");
    if (!pattern.test(spaced)) continue;
    const ids = index.stores.filter((store) => foldKey(parseStoreName(store).city, index.abbreviations).trim().startsWith(`${city} `)).map((store) => store.id);
    mentions.push({ locationIds: ids, matched: city });
  }

  // What is left: a partial name or a typo, where the sentence says it is a store.
  const covered = new Set(mentions.flatMap((mention) => mention.locationIds));
  const seen = new Set<string>();
  for (const [pattern, nounFollows] of [[SPAN_BEFORE_NOUN, true], [SPAN_AT_END, false]] as const) {
    for (const match of spaced.matchAll(pattern)) {
      const span = match[1]!.trim();
      const normalized = foldKey(span, index.abbreviations).trim();
      if (!normalized || seen.has(normalized) || /['’]s$/i.test(span)) continue;
      const words = normalized.split(" ");
      if (words.length > 4) continue;
      if (words.every((word) => GENERIC_WORDS.has(word)) || /^\d+$/.test(normalized)) continue;
      seen.add(normalized);

      const resolution = resolveStoreText(span, index);
      if (resolution.kind === "resolved") {
        if (!covered.has(resolution.store.id) || resolution.confirm) {
          mentions.push({ locationIds: [resolution.store.id], confirm: resolution.confirm, matched: span });
        }
      } else if (resolution.kind === "ambiguous") {
        mentions.push({
          locationIds: resolution.candidates.map((store) => store.id),
          collision: resolution.reason === "number_collision",
          ...(resolution.numbering ? { numbering: resolution.numbering } : {}),
          matched: span,
        });
      } else if (nounFollows && !words.some((word) => GENERIC_WORDS.has(word))) {
        if (!mentions.some((mention) => mention.matched && foldKey(mention.matched, index.abbreviations).includes(` ${normalized} `))) {
          unmatched.push(span);
        }
      }
    }
  }

  return { mentions, unmatched };
}
