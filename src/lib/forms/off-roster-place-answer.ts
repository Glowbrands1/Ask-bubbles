import { offRosterPlaceAnswerEnabled } from "@/lib/config/chat-quality-flags";
import { COMPANY_LOCATIONS, locationById } from "@/lib/locations";
import type { AccessScope } from "@/types";

import { storeOnlyTurn } from "@/lib/ai/store-alias";
import { authorizeLocation } from "./location-scope";
import { offeredOffRosterName, offRosterOffer } from "./off-roster-confirm";
import { offRosterQuestion, storeOnlyAnswer } from "./off-roster-ask";
import { readLocationMentions } from "./location-mention";

/*
 * ============================================================================
 * A PLACE IS NEVER THE PERSON WHILE THE OFF-ROSTER OFFER IS OPEN (OFF_ROSTER_PLACE_ANSWER_ENABLED)
 * ============================================================================
 *
 * Ported from the sibling app (QA's priority live bug there, 12 Nov 2026; a gap in OFF_ROSTER_STORE_ANSWER_ONLY): an
 * all-location admin typed "CA for <C>, do not terminate yet, she was late"; the reply offered "reply use <C>"; the
 * manager answered with a place only. The place became the employee, the Observation and the date were lost, and "use
 * <C>" was not asked again. The earlier fix covered a store manager's "dodge, ne" only. This roster writes stores
 * city-first ("Omaha, NE (West Dodge Rd)"); a state-first answer ("NE Omaha") is read too.
 *
 * With the flag on, for any scope, a reply that is only a place while the offer is open:
 *   - is read as the turn that typed the name (`placeAnswerTurn`), so the card is drafted again from the manager's own
 *     account, date and policy — the place is never a person;
 *   - after the turn (`withPlaceAnswer`), the card holds no employee, takes the store when the roster knows it and
 *     the scope allows it, and the reply asks the question and the offer again over the account it read.
 * Off, null and as given.
 */

/** US state and DC codes: the roster's names carry one ("Omaha, NE (West Dodge Rd)"). */
const STATE_CODES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "),
);
/** The states the roster's stores are in: typed in lower case, only these read as a state ("omaha, ne"). */
const DIRECTORY_STATES = new Set(COMPANY_LOCATIONS.map((location) => (location.state ?? "").toUpperCase()).filter(Boolean));
const PLACE_WORDS = String.raw`[A-Za-z][A-Za-z.'’-]*(?:\s+[A-Za-z0-9][A-Za-z0-9.'’-]*){0,3}`;
/** "NE Omaha", "at the NE Omaha store". */
const STATE_FIRST = new RegExp(String.raw`^(?:(?:at|in)\s+)?(?:the\s+)?([A-Za-z]{2})[\s,]+(${PLACE_WORDS}?)(?:\s+(?:store|location))?\s*[.!]?$`);
/** "Omaha, NE", "Omaha, NE (West Dodge Rd)", "omaha, ne". */
const STATE_LAST = new RegExp(String.raw`^(?:(?:at|in)\s+)?(?:the\s+)?(${PLACE_WORDS}?),\s*([A-Za-z]{2})(?:\s*\([^()]{1,40}\))?(?:\s+(?:store|location))?\s*[.!]?$`);

const stateCode = (typed: string) => {
  const upper = typed.toUpperCase();
  if (!STATE_CODES.has(upper)) return false;
  // Typed in capitals it is a code wherever; in lower case only the directory's own states ("ne", never "in" or "me").
  return typed === upper || DIRECTORY_STATES.has(upper);
};

export interface PlaceAnswer {
  /** The name the offer is open for. */
  readonly pending: string;
  /** The place as typed. */
  readonly place: string;
  /** The roster's store, when it knows the place. */
  readonly storeId: string | null;
}

/** The one store the roster reads in a place-only turn, or null. */
function rosterStore(text: string): string | null {
  if (!storeOnlyAnswer(text)) return null;
  const mentions = readLocationMentions(text).filter((mention) => mention.locationIds.length === 1 && !mention.confirm);
  return mentions[0]?.locationIds[0] ?? null;
}

/** A turn that is only a place: a roster store, "<City>, <ST>" or "<ST> <City>". */
export function placeOnly(text: string): { storeId: string | null } | null {
  const said = (text ?? "").replace(/\s+/g, " ").trim();
  if (said === "" || said.length > 60) return null;
  const storeId = rosterStore(said);
  if (storeId) return { storeId };
  const first = STATE_FIRST.exec(said);
  if (first && stateCode(first[1]!)) return { storeId: null };
  const last = STATE_LAST.exec(said);
  if (last && stateCode(last[2]!)) return { storeId: null };
  return null;
}

type Turn = { readonly role: string; readonly content: string };

/**
 * The open offer's name and the place, when this turn is only a place answering it. Off, or any other turn, null. A
 * store manager's store-only answer is OFF_ROSTER_STORE_ANSWER_ONLY's (`off-roster-ask.ts`), which holds the card with
 * its store as it stands; this reader leaves it there.
 */
export function placeAnswerOf(question: string, history: readonly Turn[], scope?: AccessScope | null): PlaceAnswer | null {
  if (!offRosterPlaceAnswerEnabled()) return null;
  if (scope?.level === "location" && (storeOnlyAnswer(question) || storeOnlyTurn(question))) return null;
  const lastAssistant = [...history].reverse().find((turn) => turn.role === "assistant");
  const pending = offeredOffRosterName(lastAssistant?.content);
  if (!pending) return null;
  const place = placeOnly(question);
  if (!place) return null;
  return { pending, place: question.trim(), storeId: place.storeId };
}

/** The turn the card is drafted from: the manager's turn that typed the name, so the place never reads as a person. */
export function placeAnswerTurn(answer: PlaceAnswer, history: readonly Turn[]): string | null {
  const typed = [...history]
    .reverse()
    .find((turn) => turn.role === "user" && turn.content.toLowerCase().includes(answer.pending.toLowerCase()));
  return typed?.content ?? null;
}

/** The lead the turn's reply opens with (the card for the name, or the offer for it); the account under it stays. */
const LEAD = /^(?:I['’]ll draft |I can['’]t find |I couldn['’]t find |\*\*[^*]+\*\* isn['’]t in the Woven roster)/;

interface CardLike {
  employeeName: string | null;
  employeeRole?: string | null;
  status: string;
  supportsInlineDraft?: boolean;
  locationId?: string | null;
  locationName?: string | null;
  locationResolution?: string;
}

/** After the turn: no employee on the card, the store where the scope allows, and the question and offer again. */
export function withPlaceAnswer<T extends { content: string; formProposal?: CardLike | null }>(
  answer: T,
  place: PlaceAnswer,
  scope: AccessScope | null | undefined,
): T {
  const card = answer.formProposal;
  const store = place.storeId ? locationById(place.storeId) : undefined;
  const allowed = store && authorizeLocation(scope ?? null, store.id).kind === "authorized";
  const account = answer.content
    .split(/\n{2,}/)
    // The lead, and any line that names the person still unconfirmed ("What is **<c>**'s position …"), are not the account.
    .filter((paragraph) => !LEAD.test(paragraph.trim()) && !paragraph.toLowerCase().includes(place.pending.toLowerCase()))
    .join("\n\n")
    .trim();
  const noted = allowed
    ? `I've set the store to **${store!.name}**.`
    : `I read **${place.place}** as the store, not the employee's name.`;
  const content = [`${noted} ${offRosterQuestion(place.pending)} ${offRosterOffer(place.pending)}`, account].filter(Boolean).join("\n\n");
  if (!card) return { ...answer, content };
  return {
    ...answer,
    content,
    formProposal: {
      ...card,
      employeeName: null,
      employeeRole: null,
      status: "needs_employee",
      supportsInlineDraft: false,
      ...(allowed ? { locationId: store!.id, locationName: store!.name, locationResolution: "resolved" } : {}),
    },
  };
}
