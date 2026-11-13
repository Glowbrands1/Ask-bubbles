import { whatHappenedNoCreateEnabled } from "@/lib/config/chat-quality-flags";

/**
 * ============================================================================
 * WHILE THE APP ASKS WHAT HAPPENED, THE CARD OFFERS NO CREATE (WHAT_HAPPENED_NO_CREATE_ENABLED)
 * ============================================================================
 *
 * Ported from the sibling app's round 23 (on in its production) at Pau's direction, 13 Nov 2026. A card whose reply
 * asks "You haven't told me what happened yet" (the Corrective Action intake's note, or the Coaching ask) still showed
 * an active **Create draft** and "Create the draft here when you're ready": the ask and the button contradicted each
 * other. On: such a card shows, but offers no Create until the account arrives — the next card, built from the
 * manager's answer, offers it as before. The "Create the draft here when you're ready" line beside the ask goes too.
 * Any other reply is left as it is. After the reply is built; outside the proposal flow. Pure.
 */

const MARKER = "You haven't told me what happened yet";
const CREATE_LINE = /^[^\n]*Create the draft here when you're ready[^\n]*\n?/gim;

interface Card {
  readonly supportsInlineDraft: boolean;
}

export function withNoCreateWhileAsking<T extends { content: string; formProposal?: Card | null }>(answer: T): T {
  const card = answer.formProposal;
  if (!whatHappenedNoCreateEnabled() || !card || !answer.content.includes(MARKER)) return answer;
  const content = answer.content.replace(CREATE_LINE, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!card.supportsInlineDraft && content === answer.content) return answer;
  return { ...answer, content, formProposal: { ...card, supportsInlineDraft: false } };
}
