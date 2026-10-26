import { storeAliasEnabled } from "@/lib/config/chat-quality-flags";
import { COMPANY_LOCATION_ENTRIES } from "@/config/company/locations";
import { readLocationMentions } from "@/lib/forms/location-mention";

import type { AskRequest } from "./types";

/**
 * STORE_ALIAS_ENABLED: the way managers name a store is written as the
 * roster name before any reader sees the turn.
 *
 * Live chats, 25 Oct 2026: "dodge ne", "dodge ne location" and a bare "dodge,
 * ne" reply were not the Dodge store, so the Create draft button never
 * appeared (ported from the sibling app, where a short street name was not
 * read either). The readers are not changed: each manager turn has
 * its aliases replaced by the roster name, which every reader already reads.
 *
 * THE ALIASES ARE BUILT FROM THE LOCATION LIST, never typed in by hand:
 *   - city or street with the state ("kearney ne", "dodge, ne") is a place
 *     wherever it appears;
 *   - city and street together ("omaha dodge", "dodge omaha") too;
 *   - the street or city alone ("dodge", "west dodge") only where the sentence says
 *     it is a place ("at", "our", "location", "store", "the location is …";
 *     "in" and "the" only for a name of two words or more: "in the dodge" is
 *     a car) or when it is the whole reply ("dodge, ne"; a one-word reply
 *     such as "dodge" only after the app asked which store).
 * An alias two locations share is never used. A roster name already typed is
 * left as it is. A store the manager rules out ("not at dodge", "never at the
 * dodge location") is never rewritten (QA-6, 26 Oct 2026). Off, every turn is
 * read as typed.
 *
 * The same file in the sibling app; only `READERS` differs.
 */

interface PlaceParts {
  /** The roster name the readers know. */
  readonly name: string;
  readonly state: string;
  readonly city: string;
  /** The part of the name after the city, when several locations share the city. */
  readonly local: string | null;
}

/** This app's stores, as name, state, city and the street in brackets ("Omaha, NE (West Dodge Rd)"). */
const READERS = {
  /**
   * The roster name as written into the turn: without its comma ("Grand
   * Island NE"), which the location reader reads the same, so no clause
   * splitter cuts the turn at it ("at Grand Island, NE used her cell phone"
   * left "NE used her cell phone" as the Issue; QA, 26 Oct 2026).
   */
  written: (name: string): string => name.replace(/,/g, ""),
  /**
   * A whole-turn place reply is written as this app's slot answer, "the store
   * is Kearney NE": every reader takes it as the store, and the incident
   * readers never take it for what happened (QA, 26 Oct 2026).
   */
  placeReply: (name: string): string => `the store is ${name.replace(/,/g, "")}`,
  /** The turn names one store the readers read. */
  named: (text: string): boolean => readLocationMentions(text).some((mention) => mention.locationIds.length === 1),
  places: (): PlaceParts[] =>
    COMPANY_LOCATION_ENTRIES.filter((entry) => entry.state).map((entry) => {
      const street = /\(([^)]+)\)/.exec(entry.name)?.[1] ?? null;
      const city = entry.name.split(",")[0]!.trim();
      return { name: entry.name, state: entry.state!, city, local: street };
    }),
};

// "the location is dodge", "store: dodge" (QA, 26 Oct 2026).
const CUE_BEFORE = /\b(?:at|in|our|the|location|salon|store)\s+$|\b(?:location|salon|store)\s*(?:is|=|:)\s*$/i;
/** A one-word name needs a stronger cue: "in the dodge" is a car (QA-6, 26 Oct 2026). */
const ONE_WORD_CUE_BEFORE = /\b(?:at|our|location|salon|store)\s+(?:the\s+)?$|\b(?:location|salon|store)\s*(?:is|=|:)\s*$/i;
/**
 * A place the manager rules out, in the same clause: "not at dodge", "never
 * at the dodge location", "isn't kearney ne", "except bellevue", "without
 * the dodge store". A comma or a stop ends it, so "it is not dodge, it is
 * grand island ne" still reads Grand Island. The readers do not read
 * negation, so a store ruled out must never be written as the store.
 */
const RULED_OUT = /\b(?:not|never|no|isn['’]?t|wasn['’]?t|aren['’]?t|weren['’]?t|doesn['’]?t|didn['’]?t|except|without)\b[^,.;!?\n]{0,30}$/i;
const CUE_AFTER = /^\s*(?:location|salon|store)\b/i;
const SUFFIXES: readonly [string, string][] = [
  ["street", "st"],
  ["road", "rd"],
  ["parkway", "pkwy"],
  ["avenue", "ave"],
  ["boulevard", "blvd"],
];
const DIRECTION = /^(?:west|east|north|south|w|e|n|s)\s+/;

interface Alias {
  readonly phrase: string;
  readonly name: string;
  readonly cued: boolean;
}

/** The short forms of a street part: "West Dodge Rd" → "west dodge road", "west dodge", "dodge". */
function localForms(local: string): string[] {
  const base = local.toLowerCase().replace(/[().,]/g, " ").replace(/\s+/g, " ").trim();
  const forms = new Set([base]);
  for (const [long, short] of SUFFIXES) {
    for (const form of [...forms]) {
      forms.add(form.replace(new RegExp(`\\b${long}$`), short));
      forms.add(form.replace(new RegExp(`\\b${short}$`), long));
    }
  }
  for (const form of [...forms]) {
    const bare = form.replace(new RegExp(`\\s+(?:${SUFFIXES.flat().join("|")})$`), "");
    if (bare !== form && /[a-z]{4,}$/.test(bare)) forms.add(bare);
    const undirected = bare.replace(DIRECTION, "");
    if (undirected !== bare && /^[a-z]{4,}$/.test(undirected)) forms.add(undirected);
  }
  return [...forms].filter((form) => form.length >= 3);
}

const ALIASES: readonly Alias[] = (() => {
  const all: Alias[] = [];
  for (const place of READERS.places()) {
    const state = place.state.toLowerCase();
    const city = place.city.toLowerCase();
    const add = (phrase: string, cued: boolean) => all.push({ phrase, name: place.name, cued });
    if (place.local) {
      for (const local of localForms(place.local)) {
        add(`${local} ${state}`, false);
        add(`${local}, ${state}`, false);
        add(`${city} ${local}`, false);
        add(`${local} ${city}`, false);
        add(`${state} ${city} ${local}`, false);
        add(local, true);
      }
    } else {
      add(`${city} ${state}`, false);
      add(`${city}, ${state}`, false);
      add(`${state} ${city}`, false);
      add(city, true);
    }
  }
  // One alias, one location: a phrase two locations share is never used.
  const owners = new Map<string, Set<string>>();
  for (const alias of all) owners.set(alias.phrase, (owners.get(alias.phrase) ?? new Set()).add(alias.name));
  const seen = new Set<string>();
  return all
    .filter((alias) => owners.get(alias.phrase)!.size === 1 && !seen.has(alias.phrase) && seen.add(alias.phrase))
    .sort((a, b) => b.phrase.length - a.phrase.length);
})();

export function withStoreAliases(request: AskRequest): AskRequest {
  if (!storeAliasEnabled()) return request;
  const asked = (index: number) => {
    const before = [...request.history.slice(0, index)].reverse().find((turn) => turn.role === "assistant");
    // The app asked, or its card is still waiting on the store.
    const card = (before as { readonly formProposal?: { readonly locationId?: string | null; readonly locationResolution?: string } | null } | undefined)?.formProposal;
    return PLACE_QUESTION.test(before?.content ?? "") || Boolean(card && !card.locationId && card.locationResolution === "needs_selection");
  };
  // An alias fills the first STORE the chat names; a turn that already names one the
  // readers read, and every turn after it, stays as typed, so a later place word never
  // changes the store (that is NEWEST_PLACE_TURN_ENABLED's, as on main).
  let named = false;
  const write = (text: string, placeAsked: boolean): string => {
    if (named) return text;
    // A turn the readers already read is theirs as typed, unless it answers
    // the app's own "which store?".
    if (!placeAsked && READERS.named(text)) {
      named = true;
      return text;
    }
    const out = rosterNames(text, placeAsked);
    named = READERS.named(out);
    return out;
  };
  let changed = false;
  const history = request.history.map((turn, index) => {
    if (turn.role !== "user" || typeof turn.content !== "string") return turn;
    const content = write(turn.content, asked(index));
    if (content === turn.content) return turn;
    changed = true;
    return { ...turn, content };
  });
  const question = write(request.question, asked(request.history.length));
  changed ||= question !== request.question;
  return changed ? { ...request, question, history } : request;
}

/** The app asked which store: a one-word reply may be a place. */
const ADDRESS = /\baddress\b[:\s]+[^.;\n]+|\b\d{1,6}\s+[A-Za-z][^,.;\n]*(?:,\s*[^,.;\n]+){0,3},?\s+[A-Za-z]{2}\.?\s+\d{5}(?:-\d{4})?\b/gi;

const PLACE_QUESTION = /\b(?:salon|store|location)\b[^\n?]*\?/i;

/**
 * The text with every alias it uses written as the roster name. `placeAsked`:
 * the app's last message asked which store, so a one-word reply
 * ("dodge") is read as a place; otherwise a one-word reply stays as typed (it
 * may be a name).
 */
export function rosterNames(text: string, placeAsked = false): string {
  if (!text) return text;
  // A roster name already typed is kept out of the alias pass.
  const kept: string[] = [];
  let out = text;
  for (const place of READERS.places()) {
    out = out.replace(new RegExp(escape(place.name), "gi"), (found) => `\u0000${kept.push(found) - 1}\u0000`);
  }
  // An address ("permanent address 123 Main St, Kearney, NE 68847") is the
  // address reader's, never a store.
  out = out.replace(ADDRESS, (found) => `\u0000${kept.push(found) - 1}\u0000`);
  const whole = out.trim().replace(/[.!?]+$/, "").trim().toLowerCase();
  // A roster name typed alone under "Which store?" is the store answer too.
  if (placeAsked && /^\u0000\d+\u0000$/.test(whole) && READERS.places().some((place) => place.name === kept[Number(whole.slice(1, -1))])) {
    return READERS.placeReply(kept[Number(whole.slice(1, -1))]!);
  }
  for (const alias of ALIASES) {
    if (whole === alias.phrase && (placeAsked || alias.phrase.includes(" "))) {
      out = READERS.placeReply(alias.name);
      break;
    }
    const pattern = new RegExp(`(?<![\\w\\u0000])${escape(alias.phrase).replace(/,\\s?/g, ",?\\s*").replace(/ /g, "\\s+")}(?![\\w\\u0000])`, "gi");
    out = out.replace(pattern, (found, offset: number, all: string) => {
      const before = all.slice(0, offset);
      if (RULED_OUT.test(before)) return found;
      const cue = alias.phrase.includes(" ") ? CUE_BEFORE : ONE_WORD_CUE_BEFORE;
      if (alias.cued && !cue.test(before) && !CUE_AFTER.test(all.slice(offset + found.length))) return found;
      return `\u0000${kept.push(READERS.written(alias.name)) - 1}\u0000`;
    });
  }
  return out.replace(/\u0000(\d+)\u0000/g, (_, index: string) => kept[Number(index)]!);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
