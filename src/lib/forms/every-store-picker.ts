import { COMPANY_LOCATIONS } from "@/lib/locations";
import type { AskResponse } from "@/lib/ai/types";
import type { ChatFormProposal } from "@/types";

/**
 * ============================================================================
 * THE REGULAR CHAT'S ADMIN CARD ASKS WHICH STORE (QA, 23 Nov 2026, after A2 #1087)
 * ============================================================================
 *
 * A login that covers every store got a ready card with no store ("Your account covers every store, so the form won't
 * name one"), and Create saved the form with location null. The card is now asked about as the agent loop's is: still
 * ready, with every store offered on it to pick (`needs_selection`), and the app's own "won't name one" sentence becomes
 * the question. Create refuses a card with no store (`create-inline-form.ts`). A store the manager named, or the person's
 * one Woven store, already resolved the card and leaves it as it is; so does a loop card (the loop asks on its own).
 */
export const EVERY_STORE_ASK = "Which store is this about? Choose the store on the card before you create the draft, so it is not filed with no store.";
const WONT_NAME_ONE = /Your account covers every (?:store|salon), so (?:this|the) form won['’]t name one(?: unless you did)?\.\s*/g;

function asksStore(card: ChatFormProposal): boolean {
  return !card.locationId && card.locationResolution === "not_applicable" && !card.noStoreStated && !card.fromAgentLoop;
}

function picker(card: ChatFormProposal): ChatFormProposal {
  return asksStore(card) ? { ...card, locationResolution: "needs_selection", authorizedLocationIds: COMPANY_LOCATIONS.map((location) => location.id) } : card;
}

export function withEveryStorePicker(answer: AskResponse): AskResponse {
  const cards = [answer.formProposal, ...(answer.formProposals ?? [])].filter((card): card is ChatFormProposal => Boolean(card));
  if (!cards.some(asksStore)) return answer;
  const replaced = answer.content.replace(WONT_NAME_ONE, `${EVERY_STORE_ASK} `).trimEnd();
  const content = replaced.includes(EVERY_STORE_ASK) ? replaced : `${replaced}\n\n${EVERY_STORE_ASK}`;
  return {
    ...answer,
    content,
    ...(answer.formProposal ? { formProposal: picker(answer.formProposal) } : {}),
    ...(answer.formProposals ? { formProposals: answer.formProposals.map(picker) } : {}),
  };
}
