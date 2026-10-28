import { additionalLocationTakenEnabled } from "@/lib/config/chat-quality-flags";
import { ROSTER_STORE_INDEX } from "@/lib/forms/location-mention";
import { authorizedLocationIds, namedStoreIds } from "@/lib/forms/location-scope";
import { CORRECTION, bareStoreReply } from "@/lib/forms/store-confirmation";

import type { ChatActor } from "./form-proposal";
import type { AskRequest } from "./types";

/**
 * ADDITIONAL_LOCATION_TAKEN_ENABLED (Pau, 28 Oct 2026; this app only — Ask Sunny
 * already takes an additional salon from these turns):
 * a manager covering West Dodge Rd and Kearney opened a form at Dodge, then
 * said "Store: Kearney.", "kearney" or "the store is Kearney". The short turn
 * was not read as a change, so both stores were read together: the reply asked
 * "Kearney or Omaha?" and the card stayed at Dodge. "actually it was at
 * kearney" was read as the change it is.
 *
 * With the flag on, a later manager turn that is only a store — six words at
 * most, one store, one of the manager's OWN stores (primary or additional) —
 * is read as that change: "actually it was at kearney". Earlier turns of that
 * shape too, so the next turn keeps it. Only the readers see this; what the
 * manager typed is stored as typed. A store outside the manager's scope, or a
 * longer sentence, is read as before.
 */
const LABEL = /^\s*(?:the\s+)?(?:store|location)\s*(?::|\bis\b|=)\s*/i;
const MAX_WORDS = 6;

function ownStoreReply(turn: string, allowed: readonly string[]): string | null {
  const core = turn.replace(LABEL, "").trim().replace(/[.!]+$/, "").trim();
  if (!core || /[?]/.test(core) || core.split(/\s+/).length > MAX_WORDS || CORRECTION.test(core)) return null;
  const reply = bareStoreReply(core);
  const ids = new Set([
    ...namedStoreIds(core, undefined, ROSTER_STORE_INDEX),
    ...(reply?.kind === "resolved" && !reply.confirm ? [reply.store.id] : []),
  ]);
  if (ids.size !== 1 || !allowed.includes([...ids][0]!)) return null;
  return /^(?:it|at|in)\b/i.test(core) ? `actually ${core}` : `actually it was at ${core}`;
}

export function withAdditionalStore(request: AskRequest, actor: ChatActor): AskRequest {
  if (!additionalLocationTakenEnabled() || !actor.scope || actor.scope.level === "global") return request;
  const allowed = authorizedLocationIds(actor.scope);
  if (allowed.length < 2) return request;
  let users = 0;
  let changed = false;
  const history = request.history.map((turn) => {
    if (turn.role !== "user" || typeof turn.content !== "string") return turn;
    users += 1;
    const read = users > 1 ? ownStoreReply(turn.content, allowed) : null;
    if (!read) return turn;
    changed = true;
    return { ...turn, content: read };
  });
  const question = users > 0 ? ownStoreReply(request.question, allowed) : null;
  if (!changed && !question) return request;
  return { ...request, question: question ?? request.question, history };
}
