import { managerWordsOnlyEnabled } from "@/lib/config/chat-quality-flags";
import { extractJobTitle } from "@/lib/forms/proposal";

import { titleTextFromQuestion } from "./title-words";
import type { AskRequest, AskResponse } from "./types";

/**
 * ============================================================================
 * THE TITLE THE MANAGER STATED, ON EVERY TURN — MANAGER_WORDS_ONLY_ENABLED
 * ============================================================================
 *
 * QA, 29 Oct 2026, live with the flag on: "create coaching form. tessa ormond
 * is ass't store manager. tessa did not call anyone about opening late" gave
 * Position "Store Manager", and the next turn ("kearney") kept it. The flag
 * read the title only from the turn being answered (grounded entities), so a
 * card built from the whole conversation — or on a path that turn does not
 * reach — read "ass't store manager" as Store Manager again.
 *
 * Last in the answer chain: the latest manager turn that states a title, read
 * as the flag reads it ("ass't" is assistant; the app's own lines and a
 * pasted policy are not the manager's words), is the card's Position. A turn
 * that states no title changes nothing. Off: the response as it was.
 */
export function withManagerStatedTitle(response: AskResponse, request: AskRequest): AskResponse {
  if (!managerWordsOnlyEnabled()) return response;
  const card = response.formProposal;
  if (!card) return response;
  const turns = [
    ...(request.history ?? []).filter((turn) => turn.role === "user").map((turn) => turn.content),
    request.question,
  ];
  for (const turn of turns.reverse()) {
    const stated = extractJobTitle(titleTextFromQuestion(turn));
    if (!stated) continue;
    if (stated === card.employeeRole) return response;
    return { ...response, formProposal: { ...card, employeeRole: stated, employeeRoleSource: "manager" } };
  }
  return response;
}
