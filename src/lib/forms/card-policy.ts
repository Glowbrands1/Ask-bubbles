import { wornClothingIsDressCodeEnabled } from "@/lib/config/chat-quality-flags";
import { withoutReadersLineBox } from "./readers-line-headings";
import type { ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * THE DRAFT CITES THE POLICY ITS CARD CITED
 * ============================================================================
 *
 * NEXT_PUBLIC_CARD_POLICY_TO_DRAFT_ENABLED. QA's live check, 3 Nov 2026: the
 * card for "make me a CA for <name> for being late to opening this morning"
 * read "**Policy:** Late Opening Policy, JBA Policy Manual p.15", and the
 * draft made from it cited Attendance p.14 — the card's policy is read by
 * one reader, the draft's by another, and the card's was never sent. The
 * heading on the card the manager pressed Create on is sent with the draft
 * request; the draft route uses it where the pinned manual has it.
 */

/** "**Policy:** Late Opening Policy, JBA Policy Manual p.15, as you said" → "Late Opening". */
export function cardPolicyHeading(content: string): string | null {
  const line = /\*\*Policy:\*\*\s*([^\n]+)/.exec(content)?.[1];
  if (!line) return null;
  // c259 (ported from the sibling app, QA2 21 Nov 2026): "Standards of Conduct — Time Records, …" reads back as Time Records (`readers-line-headings.ts`).
  const first = withoutReadersLineBox(line).split(/;|\s—\s/)[0]!;
  // WORN_CLOTHING_IS_DRESS_CODE_ENABLED (Gate-Bubbles-2 on #818): "Dress Code (JBA Policy Manual p.15) — read from this
  // request" names the policy "Dress Code"; the page beside it is the card's, never part of the name (the Action plan's
  // "Management will review the Dress Code policy" kept the page otherwise).
  const unpaged = wornClothingIsDressCodeEnabled() ? first.replace(/\s*\(JBA Policy Manual pp?\.[^)]*\)/i, "") : first;
  const heading = unpaged
    .replace(/,\s*JBA Policy Manual.*$/i, "")
    .replace(/,\s*as you said.*$/i, "")
    .replace(/\s+Policy$/i, "")
    .trim();
  return heading.length > 0 && heading.length <= 80 ? heading : null;
}

/** The policy heading on the card with this proposal id, in this conversation. */
export function cardPolicyFor(proposal: Pick<ChatFormProposal, "proposalId">, messages: readonly Pick<ChatMessage, "role" | "content" | "formProposal">[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role === "assistant" && message.formProposal?.proposalId === proposal.proposalId) {
      /*
       * The card's own policy when it carries one (only the agent loop's cards set `policyLine`; ported from the sibling
       * app, QA 17 Nov 2026), else the reply's Policy line, as before.
       */
      const own = message.formProposal.policyLine;
      if (own !== undefined) return own ? cardPolicyHeading(`**Policy:** ${own}`) : null;
      return cardPolicyHeading(message.content);
    }
  }
  return null;
}

/** As the manual's headings are named in a sentence: "Late Opening" → "Late Opening policy". */
export function cardPolicyPhrase(heading: string): string {
  const name = heading.trim().slice(0, 120);
  return /\bpolic(?:y|ies)$/i.test(name) ? name : `${name} policy`;
}

/**
 * Ported from the sibling app (Pau's ruling, 17 Nov 2026): the card's whole policy line ("Attendance Policy, JBA Policy
 * Manual p.14[; <Heading> Policy, JBA Policy Manual p.N]"), sent with an agent-loop card's draft as `cardPolicyLine`: its
 * second heading is ticked beside the first, it is the saved Policy Violated, and a Coaching Form's Details end with it.
 * The card's own line (the agent loop's), else the reply's "**Policy:**" line; ", as you said" and its like are not part
 * of it. Null when the card cites none (or the manager took it off).
 */
export function cardPolicyLineFor(proposal: Pick<ChatFormProposal, "proposalId">, messages: readonly Pick<ChatMessage, "role" | "content" | "formProposal">[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "assistant" || message.formProposal?.proposalId !== proposal.proposalId) continue;
    const own = message.formProposal.policyLine;
    const line = own !== undefined ? (own ?? "") : (/\*\*Policy:\*\*\s*([^\n]+)/.exec(message.content)?.[1] ?? "");
    const clean = line.replace(/,\s*as you said.*$/i, "").replace(/[\s.]+$/, "").trim();
    return clean.length > 0 && clean.length <= 200 ? clean : null;
  }
  return null;
}
