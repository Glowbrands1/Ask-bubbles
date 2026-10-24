import { antiLoopEnabled } from "@/lib/config/chat-quality-flags";
import { supportsInlineDraft } from "@/lib/forms/inline-draft";
import { rosterLocationName } from "@/lib/forms/location-mention";
import { COMPANY_LOCATIONS } from "@/lib/locations";
import type { AccessScope, ChatFormProposal } from "@/types";

/**
 * Pau's anti-loop rules for a replay that fails the same way twice.
 * `cardEmployeeName` and `storeWithoutGate` do nothing while
 * `ANTI_LOOP_ENABLED` is off. The other helpers are pure and the callers
 * use them only when the flag is on.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const LABEL_WORDS = new Set([
  "location",
  "payroll",
  "warning",
  "policy",
  "position",
  "promo",
  "promotion",
  "bogo",
  "title",
  "date",
]);

/**
 * A form field's own label, not a person. "Job Title" is the label. The words
 * after it belong on the Job Title slot, so they are not kept as a name either.
 */
const FIELD_LABEL =
  /^(?:job title|employee name|full name|title|position|location|store|date|job)$/i;

function placeWords(): Set<string> {
  const words = new Set<string>();
  for (const store of COMPANY_LOCATIONS) {
    for (const word of store.name.toLowerCase().split(/[^a-z]+/)) {
      if (word.length > 3) words.add(word);
    }
  }
  return words;
}

/**
 * Stores, cities, field labels, and promo words are not part of a name.
 * A surname such as "Employee" stays. An empty result means there was no name.
 */
export function stripNonNameTokens(name: string): string | null {
  const folded = name.trim().replace(/\s+/g, " ");
  if (FIELD_LABEL.test(folded)) return null;
  if (/^(?:job title|employee name|full name)\b/i.test(folded)) return null;
  const places = placeWords();
  const kept = name
    .trim()
    .split(/\s+/)
    .filter((word) => {
      const token = word.toLowerCase().replace(/[^a-z]/g, "");
      if (!token) return false;
      if (LABEL_WORDS.has(token)) return false;
      if (places.has(token)) return false;
      return true;
    });
  const next = kept.join(" ").trim();
  return next || null;
}

/** The card's employee. On, a model-supplied name is ignored. */
export function cardEmployeeName(typed: string | null, model: string | null): string | null {
  if (!antiLoopEnabled()) return typed ?? model;
  return typed ? stripNonNameTokens(typed) : null;
}

/** A date on the card is ISO, or it is not on the card. */
export function isoCardDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return ISO_DATE.test(value) ? value : null;
}

export function singleAccountStore(scope: AccessScope | null | undefined): string | null {
  if (!scope || scope.level !== "location") return null;
  const ids = [scope.primaryAreaId, ...scope.alsoCoversAreaIds].filter((id): id is string => Boolean(id));
  const unique = [...new Set(ids)];
  return unique.length === 1 ? unique[0]! : null;
}

/**
 * The store is not a question. A named store that already resolved stays.
 * Otherwise the account's single store, then the roster's single store,
 * otherwise blank and the card can still be filed.
 */
export function storeWithoutGate(
  proposal: ChatFormProposal,
  scope: AccessScope | null | undefined,
  rosterLocationIds: readonly string[],
): ChatFormProposal {
  if (!antiLoopEnabled()) return proposal;
  if (proposal.locationResolution === "resolved" && proposal.locationId) return proposal;
  const account = singleAccountStore(scope);
  const roster = rosterLocationIds.length === 1 ? rosterLocationIds[0]! : null;
  const chosen = account ?? roster;
  const inline = supportsInlineDraft(
    proposal.templateKey,
    proposal.variantKey ? [{ key: proposal.variantKey, label: proposal.variantKey, role: "", roleAbbr: "" }] : [],
  );
  const rest = { ...proposal };
  delete rest.locationSelection;
  delete rest.locationCandidates;
  delete rest.namedLocationOutOfScope;
  if (chosen) {
    return {
      ...rest,
      locationId: chosen,
      locationName: rosterLocationName(chosen),
      locationResolution: "resolved",
      locationSource: account ? "assignment" : "woven",
      authorizedLocationIds: [],
      status: proposal.employeeName ? "ready" : proposal.status,
      supportsInlineDraft: Boolean(proposal.employeeName) && inline,
    };
  }
  if (!proposal.employeeName) return proposal;
  return {
    ...rest,
    locationId: null,
    locationName: null,
    locationResolution: "unavailable",
    authorizedLocationIds: [],
    status: "ready",
    supportsInlineDraft: inline,
  };
}

export interface HarnessEvent {
  readonly kind: "dropped_first_message";
  readonly detail: string;
}

/**
 * A fresh chat used to arrive with an empty first slot, and the runner
 * treated that as the case missing its opening turn. The empty slot is a
 * harness event. The first real user message is still the first question.
 */
export function replayQuestions(turns: readonly string[]): { questions: string[]; events: HarnessEvent[] } {
  const events: HarnessEvent[] = [];
  if (turns.length > 0 && turns[0]!.trim() === "") {
    events.push({
      kind: "dropped_first_message",
      detail: "A fresh chat dropped the first message. It is a harness event, not a case failure. The next user message is turn 1.",
    });
  }
  return { questions: turns.map((turn) => turn.trim()).filter((turn) => turn.length > 0), events };
}
