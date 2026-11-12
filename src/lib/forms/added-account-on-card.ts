import { addedAccountOnCardEnabled } from "@/lib/config/chat-quality-flags";
import { readTurnEdit } from "@/lib/ai/edit-date-rules";
import { extractEmployeeNames, samePerson } from "@/lib/forms/proposal";
import { detectTemplateIntent } from "@/lib/forms/template-intent";

/**
 * ============================================================================
 * "SHE ALSO …" SHOWS ON THE CARD
 * ============================================================================
 *
 * ADDED_ACCOUNT_ON_CARD_ENABLED (QA's Bubbles 17q live test, item 7, 12 Nov 2026). "create a CA for <B>, she was late
 * on 11/3/26", then "she also left the register unlocked": the card cited both turns and Create saved both in the
 * Observation, but the card's "What happened" (its Issue) still showed only "she was late on 11/3/26". The card and the
 * saved draft disagreed.
 *
 * On: when the latest manager turn is one the card cites, after its first, and it adds to the account — "she also …",
 * "he also …", "<name> also …", "also, …", "and she …" — in plain account (no question, no edit instruction, no new
 * form request, nobody else named), it is added to the card's Issue in the manager's words, and the reply's
 * "**Issue:**" line says the same. A turn whose words are already in the Issue is left as it is. Pure; after the reply
 * is built. Off, nothing here runs.
 */

interface Turn {
  readonly id?: string;
  readonly role: string;
  readonly content: string;
}

interface Card {
  readonly employeeName: string | null;
  readonly sourceMessageIds: readonly string[];
  readonly issue?: string | null;
}

const ADDS_TO_ACCOUNT =
  /^\s*(?:(?:and|plus)\s+)?(?:(?:she|he|they|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:also|additionally)\s+\S|also[,\s]+\S|(?:and|plus)\s+(?:she|he|they)\s+\S)/i;

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();

/** The account a turn adds, as typed (no trailing stop); null when the turn adds none. */
export function addedAccount(text: string): string | null {
  const said = text.trim();
  if (!said || said.length > 300 || /\?\s*$/.test(said) || said.includes("\n")) return null;
  if (!ADDS_TO_ACCOUNT.test(said)) return null;
  if (readTurnEdit(said) !== null) return null;
  if (detectTemplateIntent(said).kind !== "none") return null;
  return said.replace(/[.!\s]+$/, "");
}

export function withAddedAccountOnCard<T extends { content: string; formProposal?: Card | null }>(answer: T, turns: readonly Turn[]): T {
  const card = answer.formProposal;
  if (!addedAccountOnCardEnabled() || !card?.employeeName || !card.issue?.trim()) return answer;
  const manager = turns.filter((turn) => turn.role === "user" && turn.id);
  const latest = manager.at(-1);
  if (!latest?.id || !card.sourceMessageIds.includes(latest.id) || card.sourceMessageIds[0] === latest.id) return answer;
  const added = addedAccount(latest.content);
  if (!added) return answer;
  if (extractEmployeeNames(added).some((name) => !samePerson(name, card.employeeName!))) return answer;
  const issue = card.issue.trim();
  if (norm(issue).includes(norm(added))) return answer;
  const next = `${issue}${/[.!?]$/.test(issue) ? "" : "."} ${added[0]!.toUpperCase()}${added.slice(1)}`;
  const before = `**Issue:** ${issue}`;
  const content = answer.content.includes(before) ? answer.content.replace(before, `**Issue:** ${next}`) : answer.content;
  return { ...answer, content, formProposal: { ...card, issue: next } };
}
