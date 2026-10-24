import { antiLoopEnabled } from "@/lib/config/chat-quality-flags";
import { COMPANY_LOCATIONS, locationIdsInArea } from "@/lib/locations";
import type { AccessScope } from "@/types";

import type { StoreIndex, StoreNumbering } from "@/lib/stores/resolver";

import { ROSTER_STORE_INDEX, readLocation, rosterLocationName } from "./location-mention";
import { CORRECTION, bareStoreReply, storeCorrection, storeReplyText } from "./store-confirmation";

/**
 * ============================================================================
 * WHICH LOCATION A FORM MAY BE WRITTEN AGAINST
 * ============================================================================
 *
 * `POST /api/forms/instances` accepts a `locationId` from the request. The
 * authenticated actor's scope decides whether they may file against it — the
 * request body never does.
 *
 *   global      any location on the roster
 *   location    the locations their assignment names
 *   district    the roster locations inside their district(s)
 *   region      the roster locations inside their region(s)
 *
 * Area scopes resolve through the configured roster, and an area the roster
 * does not know resolves to NO locations. Fail closed, never open.
 */

/** The location ids this scope may file a form against. */
export function authorizedLocationIds(scope: AccessScope): string[] {
  const areas = [scope.primaryAreaId, ...scope.alsoCoversAreaIds].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (scope.level === "global") return COMPANY_LOCATIONS.map((location) => location.id);
  if (scope.level === "location") return [...new Set(areas)];
  return [...new Set(areas.flatMap((area) => locationIdsInArea(area)))];
}

export type LocationAuthorization =
  | { kind: "authorized"; locationId: string }
  | { kind: "no_location" }
  | { kind: "refused"; reason: string };

export function authorizeLocation(
  scope: AccessScope | null,
  requestedLocationId: string | null | undefined,
): LocationAuthorization {
  const requested = requestedLocationId?.trim() || null;

  if (!requested) return { kind: "no_location" };

  // No scope means demo/preview: nothing is persisted against a real location.
  if (!scope) return { kind: "authorized", locationId: requested };

  if (scope.level === "global") return { kind: "authorized", locationId: requested };

  if (authorizedLocationIds(scope).includes(requested)) {
    return { kind: "authorized", locationId: requested };
  }
  return {
    kind: "refused",
    reason:
      "That store is not on your assignment. A form can only be filed against a store you are assigned to.",
  };
}

export type LocationProposal =
  | {
      resolution: "resolved";
      locationId: string;
      /** Whose word it rests on: the manager's own, the employee's Woven store, or the account's one assignment. */
      source?: "manager" | "woven" | "assignment";
    }
  | {
      resolution: "needs_selection";
      authorizedIds: string[];
      outOfScopeName?: string;
      /** Why a store is still being asked for, when the manager named something. */
      selection?: {
        reason: "ambiguous" | "number_collision" | "confirm" | "not_found";
        typed: string | null;
        numbering?: StoreNumbering;
      };
      /** Several stores the manager's own words could mean — not their whole assignment. */
      namedAmbiguous?: true;
    }
  | { resolution: "not_applicable"; reason: string }
  | { resolution: "unavailable"; reason: string };

/**
 * The location a PROPOSED form would carry: the manager's own words first,
 * then the employee's directory locations, then the account's assignment.
 * Never a guess — several candidates is a question.
 */
type LocationOptions = {
    reportUnmatched?: boolean;
    /** The manager's turns, oldest first, so a later correction can replace an earlier store. */
    turns?: readonly string[];
    /** The previous assistant turn asked which store, so a bare "Omaha" is the answer. */
    bareReply?: boolean;
    /** Earlier manager turns that answered a store question (`storeAnswerTurns`), so the answer still counts. */
    answeredTurns?: ReadonlySet<string>;
    /** A store the manager said yes to; used only if their scope allows it. */
    confirmedStoreId?: string | undefined;
  };

export function proposeLocation(
  scope: AccessScope | null,
  managerText = "",
  employeeLocationIds: readonly string[] = [],
  index: StoreIndex = ROSTER_STORE_INDEX,
  options: LocationOptions = {},
): LocationProposal {
  const detailed = proposeLocationWithSource(scope, managerText, employeeLocationIds, index, options);
  if (detailed.resolution !== "resolved") return detailed;
  return { resolution: "resolved", locationId: detailed.locationId };
}

/** `proposeLocation`, saying whose word a resolved store rests on — for the proposal's read-back. */
export function proposeLocationWithSource(
  scope: AccessScope | null,
  managerText = "",
  employeeLocationIds: readonly string[] = [],
  index: StoreIndex = ROSTER_STORE_INDEX,
  options: LocationOptions = {},
): LocationProposal {
  const reportUnmatched = options.reportUnmatched ?? true;
  const reading = (index_: StoreIndex) =>
    readCorrected(managerText, options.turns, index_, options.bareReply === true, options.answeredTurns);
  /*
   * AN ANSWER THAT COULD BE SEVERAL STORES IS CONFIRMED, NOT PICKED (QA F-12).
   * "Sioux Falls" in answer to the store question, from a manager who has one
   * of the two: the sentence reader keeps the one in scope, so it is offered
   * for confirmation ("I read … as … — is that the store?") instead of filed.
   */
  const fromAnswer = (index_: StoreIndex, allowedIds: readonly string[]): LocationProposal | null => {
    const corrected = reading(index_);
    const named = fromNamedLocations(allowedIds, corrected.text, index_, reportUnmatched);
    if (corrected.ambiguous && named?.resolution === "resolved") {
      return {
        resolution: "needs_selection",
        authorizedIds: [named.locationId],
        selection: { reason: "confirm", typed: corrected.typed },
      };
    }
    return named;
  };
  const confirmed = (allowedIds: readonly string[]): LocationProposal | null =>
    options.confirmedStoreId && allowedIds.includes(options.confirmedStoreId)
      ? { resolution: "resolved", locationId: options.confirmedStoreId, source: "manager" }
      : null;
  if (!scope) {
    return {
      resolution: "unavailable",
      reason: "Preview mode cannot verify a store, so none is filled in.",
    };
  }

  if (scope.level === "global") {
    const all = COMPANY_LOCATIONS.map((location) => location.id);
    const named = confirmed(all) ?? fromAnswer(index, all);
    if (named) return named;
    const employees = fromEmployeeLocations(all, employeeLocationIds);
    if (employees) return employees;
    return {
      resolution: "not_applicable",
      reason: "Your account covers every store rather than one, so no store is put on this form.",
    };
  }

  const allowed = authorizedLocationIds(scope);
  const named = confirmed(allowed) ?? fromAnswer(index, allowed);
  if (named) return named;
  const employees = fromEmployeeLocations(allowed, employeeLocationIds);
  if (employees) return employees;
  if (allowed.length === 1) return { resolution: "resolved", locationId: allowed[0]!, source: "assignment" };
  if (allowed.length > 1) return { resolution: "needs_selection", authorizedIds: allowed };
  return {
    resolution: "unavailable",
    reason: "Your account has no verified store assigned yet, so none can be filled in.",
  };
}

/**
 * The registered stores the manager firmly named, after a later correction has
 * replaced an earlier store. What an employee's Woven stores are checked against.
 */
export function namedStoreIds(
  managerText: string,
  turns: readonly string[] | undefined,
  index: StoreIndex,
  bareReply = false,
): string[] {
  const text = readCorrected(managerText, turns, index, bareReply).text;
  return [
    ...new Set(
      readLocation(text, index)
        // A name that could be several stores (or a number two systems disagree about) names none of them yet.
        .mentions.filter((mention) => !mention.confirm && !mention.collision && new Set(mention.locationIds).size === 1)
        .flatMap((mention) => mention.locationIds),
    ),
  ];
}

function firmStoreIds(reading: ReturnType<typeof readLocation>): string[] {
  return [
    ...new Set(
      reading.mentions
        .filter((mention) => !mention.confirm && !mention.collision && new Set(mention.locationIds).size === 1)
        .flatMap((mention) => mention.locationIds),
    ),
  ];
}

/**
 * The store the manager named as the form's store. "store location is
 * Bellevue, NE" and "primary store is Sioux Falls W 41st" are that choice.
 * A town that is not a store, or two stores with no primary, is not.
 */
function explicitStoreText(turns: readonly string[], index: StoreIndex): string | null {
  for (let at = turns.length - 1; at >= 0; at -= 1) {
    const turn = turns[at]!;
    const primary = /\bprimary store is\s+([^.]{3,80})/i.exec(turn);
    if (primary) {
      const phrase = primary[1]!.replace(/[,]+$/, "").trim();
      if (firmStoreIds(readLocation(phrase, index)).length === 1) return phrase;
    }
    if (/\blocation\s+is\b/i.test(turn) && firmStoreIds(readLocation(turn, index)).length === 1) {
      return turn;
    }
  }
  return null;
}

function readCorrected(
  managerText: string,
  turns: readonly string[] | undefined,
  index: StoreIndex,
  bareReply: boolean,
  answered?: ReadonlySet<string>,
): { text: string; ambiguous: boolean; typed: string | null } {
  const plain = { text: managerText, ambiguous: false, typed: null };
  if (antiLoopEnabled() && turns && turns.length > 0) {
    const chosen = explicitStoreText(turns, index);
    if (chosen) return { text: chosen, ambiguous: false, typed: null };
  }
  if (!turns || turns.length < 2) return plain;
  const last = turns.length - 1;
  for (let at = last; at >= 0; at -= 1) {
    const turn = turns[at]!;
    const isAnswer = (at === last && bareReply) || (answered?.has(turn.trim()) ?? false);
    const reading = readLocation(turn, index);
    if (reading.mentions.length === 0 && reading.unmatched.length === 0) {
      /*
       * "Omaha" or "66", said in answer to "Which store is this about?", names
       * no cue — it IS the answer, on this turn and on later ones. "Sorry, it's
       * Omaha" is a change of mind that names one (QA F-12).
       */
      const answer = isAnswer ? bareStoreReply(turn, index) : null;
      const correction = answer ? null : at > 0 ? storeCorrection(turn, index) : null;
      const said = answer ? turn : correction?.text;
      const resolution = answer ?? correction?.resolution;
      if (said && resolution) {
        return { text: storeReplyText(said), ambiguous: resolution.kind === "ambiguous", typed: said.trim().replace(/[.!]+$/, "") };
      }
      continue;
    }
    // The newest turn that says anything about a store decides, if it is a change or the answer.
    if (!(at > 0 && (CORRECTION.test(turn) || isAnswer))) return plain;
    // An answer that could be several stores ("Sioux Falls") is confirmed, never picked (QA F-12).
    const ambiguous = isAnswer && bareStoreReply(turn, index)?.kind === "ambiguous";
    return { text: turn, ambiguous, typed: ambiguous ? turn.trim().replace(/[.!]+$/, "") : null };
  }
  return plain;
}

/**
 * WHAT THE MANAGER'S WORDS SAY ABOUT THE STORE, in this order of trust:
 *
 *   a firm reading     a registered code, name, partial name or reviewed alias
 *   a soft reading     a typo or initialism — asked about, never used silently
 *   nothing registered "Store 102" with no store 102 — said so, not skipped
 *
 * Several candidates is a question, and the candidates offered are only the
 * ones the actor's scope allows.
 */
function fromNamedLocations(
  allowed: readonly string[],
  managerText: string,
  index: StoreIndex,
  reportUnmatched: boolean,
): LocationProposal | null {
  const { mentions, unmatched } = readLocation(managerText, index);

  if (mentions.length === 0) {
    if (!reportUnmatched || unmatched.length === 0 || allowed.length === 0) return null;
    return {
      resolution: "needs_selection",
      authorizedIds: [...allowed],
      selection: { reason: "not_found", typed: unmatched[0]! },
    };
  }

  const firm = mentions.filter((mention) => !mention.confirm);
  const reading = firm.length > 0 ? firm : mentions;
  const soft = firm.length === 0;

  /*
   * A MORE SPECIFIC MENTION NARROWS A LESS SPECIFIC ONE. "Sioux Falls" is two
   * stores; a later "E 18th St" is one of them, and the conversation as a whole
   * names that one. A mention whose stores strictly contain another mention's
   * stores is the vaguer of the two and is dropped. Unrelated mentions all
   * stand, so two different stores are still a question.
   */
  const sets = reading.map((mention) => [...new Set(mention.locationIds)]);
  const narrowed = sets.filter(
    (ids) => !sets.some((other) => other.length < ids.length && other.every((id) => ids.includes(id))),
  );
  const named = [...new Set(narrowed.flat())];
  const inScope = named.filter((id) => allowed.includes(id));
  const typed = reading[0]?.matched ?? null;
  const numbering = reading.find((mention) => mention.numbering)?.numbering;

  if (inScope.length === 1 && !soft) return { resolution: "resolved", locationId: inScope[0]!, source: "manager" };
  if (inScope.length >= 1) {
    const collision = reading.some((mention) => mention.collision);
    return {
      resolution: "needs_selection",
      authorizedIds: inScope,
      namedAmbiguous: true,
      selection: {
        reason: soft && inScope.length === 1 ? "confirm" : collision ? "number_collision" : "ambiguous",
        typed,
        ...(numbering && collision ? { numbering } : {}),
      },
    };
  }
  if (allowed.length === 0) return null;

  const outOfScopeName =
    mentions.length === 1 && named.length === 1 ? rosterLocationName(named[0]!) : null;
  return {
    resolution: "needs_selection",
    authorizedIds: [...allowed],
    ...(outOfScopeName ? { outOfScopeName } : {}),
  };
}

function fromEmployeeLocations(
  allowed: readonly string[],
  employeeLocationIds: readonly string[],
): LocationProposal | null {
  const inScope = [...new Set(employeeLocationIds)].filter((id) => allowed.includes(id));
  if (inScope.length === 1) return { resolution: "resolved", locationId: inScope[0]!, source: "woven" };
  if (inScope.length > 1) return { resolution: "needs_selection", authorizedIds: inScope };
  return null;
}
