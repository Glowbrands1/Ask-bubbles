import { outOfScopePlaceKeepsOwnEnabled } from "@/lib/config/chat-quality-flags";
import { rosterLocationName } from "@/lib/forms/location-mention";
import { authorizedLocationIds, proposeLocation } from "@/lib/forms/location-scope";

import type { ChatActor } from "./form-proposal";
import type { AskRequest, AskResponse } from "./types";

/**
 * OUT_OF_SCOPE_PLACE_KEEPS_OWN_ENABLED (Pau, 28 Oct 2026; same flag in both
 * apps): a manager never sees a card for a store they are not assigned to.
 * "Assigned" is the manager's full scope: the primary store and every store
 * they also cover. When the card holds a store outside it, the card goes back
 * to the manager's own store:
 *
 *   1. the store the earlier turns already gave the card (read again from the
 *      manager's earlier turns with the same scope rules), else
 *   2. the manager's only store, else
 *   3. no store, and the card asks which of their stores this is about —
 *      never a guess.
 *
 * Here the readers already keep a store-scoped manager's own store, so this is
 * the last check after them. A store in scope, a card with no store, and a
 * company-wide manager are left as they are. Create still refuses a store
 * outside the scope on its own.
 */
export function withOwnPlace(response: AskResponse, request: AskRequest, actor: ChatActor): AskResponse {
  const card = response.formProposal;
  if (!outOfScopePlaceKeepsOwnEnabled() || !card || !card.locationId || !actor.scope || actor.scope.level === "global") return response;
  const allowed = authorizedLocationIds(actor.scope);
  if (allowed.length === 0 || allowed.includes(card.locationId)) return response;
  const named = rosterLocationName(card.locationId);
  const earlier = request.history
    .filter((turn) => turn.role === "user" && typeof turn.content === "string")
    .map((turn) => turn.content)
    .join("\n");
  const reading = proposeLocation(actor.scope, earlier);
  const own =
    reading.resolution === "resolved" && allowed.includes(reading.locationId)
      ? reading.locationId
      : allowed.length === 1
        ? allowed[0]!
        : null;
  if (own) {
    const kept = { ...card, locationId: own, locationResolution: "resolved" as const };
    delete kept.namedLocationOutOfScope;
    return { ...response, formProposal: kept };
  }
  return {
    ...response,
    formProposal: {
      ...card,
      locationId: null,
      locationName: null,
      locationResolution: "needs_selection",
      authorizedLocationIds: [...allowed],
      ...(named ? { namedLocationOutOfScope: named } : {}),
      status: card.employeeName ? "needs_location" : card.status,
      supportsInlineDraft: false,
    },
  };
}
