import { addedDetailKeptEnabled } from "@/lib/config/chat-quality-flags";
import { extractEmployeeNames, samePerson } from "@/lib/forms/proposal";
import { detectTemplateIntent } from "@/lib/forms/template-intent";

/**
 * ============================================================================
 * "CAN YOU HAVE IT INCLUDE THAT …" IS PART OF THE FORM'S ACCOUNT
 * ============================================================================
 *
 * ADDED_DETAIL_KEPT_ENABLED (Pau via QA, sf-b6, 5 Nov 2026; QA asked for the card half, 10 Nov 2026). A Corrective
 * Action request for <name>, then "can you have it include that we recieved a customer complaint from Sunday 11-1, she
 * started closing the last register at 4:56pm …", then "Create a Corrective Action Form from this conversation.": the
 * card left the added detail out, and so did the draft. The turns the card cites leave out every manager turn that
 * reads as a question unless it names the employee, and "can you have it include that …" opens like one.
 *
 * On: a manager turn inside the card's span (after its first cited turn, before its last) that asks for something to
 * be put on the form — "include that …", "add that …", "put (in) that …", "mention that …", "note that …" — and names
 * nobody else joins the card's turns, so Create hands it to the draft; and the card shows it, as "**Also on the
 * draft:** <what they asked to add>", before its closing line. A turn already cited, a question about the form, or a
 * turn about somebody else is left as it is. After the reply is built; outside the proposal flow. Pure.
 */

interface Turn {
  readonly id?: string;
  readonly role: string;
  readonly content: string;
}

interface Card {
  readonly employeeName: string | null;
  readonly sourceMessageIds: readonly string[];
}

const ADD_TO_FORM =
  /^\s*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:have\s+it\s+|make\s+(?:it|sure\s+it)\s+)?|please\s+|also\s+|and\s+)?(?:include|add|put(?:\s+in)?|mention|note)\s+(?:on\s+(?:it|the\s+form)\s+)?that\s+([\s\S]{12,})$/i;

/** What the manager asked to put on the form, without the ask itself; null when the turn asks no such thing. */
export function addedDetail(text: string): string | null {
  const match = ADD_TO_FORM.exec(text.trim());
  if (!match) return null;
  return match[1]!.trim().replace(/\?+$/, "").trim();
}

const CLOSING = /^(?:Create the draft here|Your account covers every|\*\*Nothing has been created)/;

export function withAddedDetailKept<T extends { content: string; formProposal?: Card | null }>(answer: T, turns: readonly Turn[]): T {
  const card = answer.formProposal;
  if (!addedDetailKeptEnabled() || !card?.employeeName || card.sourceMessageIds.length < 2) return answer;
  const manager = turns.filter((turn) => turn.role === "user" && turn.id);
  const cited = new Set(card.sourceMessageIds);
  const at = manager.map((turn, index) => (cited.has(turn.id!) ? index : -1)).filter((index) => index >= 0);
  if (at.length < 2) return answer;
  const added: { id: string; detail: string }[] = [];
  for (let index = at[0]! + 1; index < at[at.length - 1]!; index += 1) {
    const turn = manager[index]!;
    if (cited.has(turn.id!)) continue;
    const detail = addedDetail(turn.content);
    if (!detail || detectTemplateIntent(turn.content).kind !== "none") continue;
    if (extractEmployeeNames(turn.content).some((name) => !samePerson(name, card.employeeName!))) continue;
    added.push({ id: turn.id!, detail });
  }
  if (added.length === 0) return answer;
  const order = new Map(manager.map((turn, index) => [turn.id!, index]));
  const sourceMessageIds = [...card.sourceMessageIds, ...added.map((turn) => turn.id)].sort(
    (a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
  const lines = added.map((turn) => `**Also on the draft:** ${turn.detail}`);
  const blocks = answer.content.split("\n\n");
  const closing = blocks.findIndex((block) => CLOSING.test(block.trim()));
  if (closing >= 0) blocks.splice(closing, 0, ...lines);
  else blocks.push(...lines);
  return { ...answer, content: blocks.join("\n\n"), formProposal: { ...card, sourceMessageIds } };
}
