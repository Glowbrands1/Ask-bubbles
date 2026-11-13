import { managerGaveAccount } from "@/lib/ai/ca-what-happened";
import type { Turn } from "@/lib/ai/coaching-what-happened";
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
 * Any other reply is left as it is. After the reply is built; outside the proposal flow.
 *
 * Gate-Bubbles on #857 (13 Nov 2026), two corrections:
 *   - the protected reader also asks on cards whose manager DID say what happened ("Didn't show up for her opening
 *     shift", an earlier turn's "she was late on 10-20-26", "131 tans"). There the ask is the reader's mistake, not a
 *     missing account, and Create stays (`ai/ca-what-happened.ts` managerGaveAccount, the same account test);
 *   - with Create gone, the note never says "You can create it now and fill it in yourself": the chat shows the
 *     button only when the card supports it (`features/chat/message-bubble.tsx`).
 */

const MARKER = "You haven't told me what happened yet";
const CREATE_LINE = /^[^\n]*Create the draft here when you're ready[^\n]*\n?/gim;
/** The intake note's offer to create now, which no button backs once Create is gone. */
const CREATE_NOW =
  /\s*—\s*the draft will come back without the policy section and page\.\s*You can create it now and fill it in yourself, or tell me here what happened and I'll draft it \(or redraft the form you created\) with the manual's section and page cited\./;
const ASK_ONLY = ". Tell me here what happened and I'll draft it with the manual's section and page cited.";

interface Card {
  readonly supportsInlineDraft: boolean;
  readonly templateKey?: string;
  readonly employeeName?: string | null;
  readonly employeeRole?: string | null;
  readonly locationName?: string | null;
}

export function withNoCreateWhileAsking<T extends { content: string; formProposal?: Card | null }>(
  answer: T,
  turn?: { readonly question: string; readonly history: readonly Turn[] },
): T {
  const card = answer.formProposal;
  if (!whatHappenedNoCreateEnabled() || !card || !answer.content.includes(MARKER)) return answer;
  // The manager already said what happened: the ask is the reader's, and Create stays.
  if (turn && managerGaveAccount(card, turn.question, turn.history)) return answer;
  const content = answer.content.replace(CREATE_LINE, "").replace(CREATE_NOW, ASK_ONLY).replace(/\n{3,}/g, "\n\n").trim();
  if (!card.supportsInlineDraft && content === answer.content) return answer;
  return { ...answer, content, formProposal: { ...card, supportsInlineDraft: false } };
}
