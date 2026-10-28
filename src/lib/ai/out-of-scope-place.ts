import { outOfScopePlaceSaidEnabled } from "@/lib/config/chat-quality-flags";
import { ROSTER_STORE_INDEX, rosterLocationName } from "@/lib/forms/location-mention";
import { authorizedLocationIds, namedStoreIds } from "@/lib/forms/location-scope";
import { bareStoreReply, storeCorrection } from "@/lib/forms/store-confirmation";

import type { ChatActor } from "./form-proposal";
import type { AskRequest, AskResponse } from "./types";

/**
 * OUT_OF_SCOPE_PLACE_SAID_ENABLED (QA, 28 Oct 2026; same flag in both apps):
 * a store-scoped manager who names, in this turn, a store they are not
 * assigned to — "Store: Kearney.", "kearney", "the store is Kearney" — kept
 * their own store on the card with no word about it. With the flag on, the
 * reply says so:
 *
 *   **Kearney, NE** isn't a store on your assignment, so the form stays at **Omaha, NE (West Dodge Rd)**.
 *
 * Only when exactly one store is named in the turn, none of the named stores
 * is the manager's, the card still holds one of the manager's own stores, and
 * the reply does not already say it. A manager whose scope is not a list of
 * stores (district, region, company) never gets it. The card is not changed.
 */
export function outOfScopeStoreLine(named: string, own: string): string {
  return `**${named}** isn't a store on your assignment, so the form stays at **${own}**.`;
}

const ALREADY_SAID = /isn['’]t a store on your assignment/;
/** "Store: Kearney.", "store is kearney", "the store is Kearney": the label before a short store reply. */
const LABEL = /^\s*(?:the\s+)?(?:store|location)\s*(?::|\bis\b|=)\s*/i;

function firmId(resolution: ReturnType<typeof bareStoreReply>): string[] {
  return resolution?.kind === "resolved" && !resolution.confirm ? [resolution.store.id] : [];
}

/** Every store this one turn names: in a sentence, as a short reply, or as a correction. */
function storesNamed(question: string): string[] {
  return [
    ...new Set([
      ...namedStoreIds(question, undefined, ROSTER_STORE_INDEX),
      ...firmId(bareStoreReply(question.replace(LABEL, ""))),
      ...firmId(storeCorrection(question)?.resolution ?? null),
    ]),
  ];
}

export function withOutOfScopePlace(response: AskResponse, request: AskRequest, actor: ChatActor): AskResponse {
  if (!outOfScopePlaceSaidEnabled() || !response.formProposal || !actor.scope) return response;
  if (ALREADY_SAID.test(response.content)) return response;
  const allowed = authorizedLocationIds(actor.scope);
  const own = response.formProposal.locationId;
  if (allowed.length === 0 || !own || !allowed.includes(own)) return response;
  const named = storesNamed(request.question ?? "");
  if (named.length !== 1 || allowed.includes(named[0]!)) return response;
  const namedName = rosterLocationName(named[0]!);
  const ownName = rosterLocationName(own);
  if (!namedName || !ownName) return response;
  return { ...response, content: `${response.content}\n\n${outOfScopeStoreLine(namedName, ownName)}` };
}
