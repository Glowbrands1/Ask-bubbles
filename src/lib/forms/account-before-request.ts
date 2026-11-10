import { accountBeforeRequestEnabled } from "@/lib/config/chat-quality-flags";
import { describesIncident } from "@/lib/forms/incident-reading";
import { extractEmployeeNames, samePerson } from "@/lib/forms/proposal";
import { detectTemplateIntent } from "@/lib/forms/template-intent";

/**
 * ============================================================================
 * THE ACCOUNT GIVEN BEFORE THE REQUEST IS HANDED TO THE DRAFT (ACCOUNT_BEFORE_REQUEST_ENABLED)
 * ============================================================================
 *
 * Pau's P14(a) (QA, 10 Nov 2026; the sibling app's #776 is the same report there): the manager describes the incident
 * over several turns, then "create a coaching form for <first name>", then "yes" — and the draft saved "No specific
 * incident … was described". In this app the card's turns leave out every manager turn that reads as a question unless
 * it names the employee in full, so an account that opens "can you help me with rowan? she marked an order as shipped
 * …" never reached the draft. (The sibling app's mechanism matches the account against the card's Observation line;
 * this app's Coaching card shows none, so the account is recognised by what it says instead.)
 *
 * On: walking back from the card's first cited turn, each manager turn just before it that recounts an incident by this
 * person — naming them by first name or opening with she / he / they, and describing what happened in the past tense (read
 * without a leading question) — joins the card's turns; the walk stops at the first turn that does not, at a request for another
 * form, or at a turn naming somebody else. After the reply is built; outside the proposal flow. Pure.
 */

interface Turn {
  readonly id?: string;
  readonly role: string;
  readonly content: string;
}

interface Card {
  readonly templateKey?: string;
  readonly employeeName: string | null;
  readonly sourceMessageIds: readonly string[];
}

const PRONOUN_LEAD = /^\s*(?:and\s+|also\s+|then\s+)?(?:she|he|they)\b/i;
/** "can you help me with rowan?", "what should I do about her?" — a lead that asks, before the account. */
const QUESTION_LEAD = /^[^.?!]*\?\s*/;

function aboutThisPerson(text: string, employeeName: string): boolean {
  const first = employeeName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (first.length >= 2 && new RegExp(`\\b${first.replace(/[^a-z0-9]/g, "")}\\b`, "i").test(text)) return true;
  return PRONOUN_LEAD.test(text.replace(QUESTION_LEAD, ""));
}

/** "she marked …", "he didn't …", "rowan left …": the subject, then a past-tense verb within a word or two. */
function pastClause(account: string, employeeName: string): boolean {
  const first = (employeeName.trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const subject = first.length >= 2 ? `(?:she|he|they|${first})` : "(?:she|he|they)";
  return new RegExp(
    `\\b${subject}\\s+(?:also\\s+|then\\s+|just\\s+|never\\s+)?(?:[a-z]+ed|didn'?t|did\\s+not|wasn'?t|was|weren'?t|left|took|gave|told|said|came|went|forgot|lost|broke|made|ran|sold|rang|let|put|kept|got|had|did)\\b`,
    "i",
  ).test(account);
}

function accountTurn(text: string, card: Card): boolean {
  const account = text.replace(QUESTION_LEAD, "").trim();
  if (account.split(/\s+/).length < 5) return false;
  if (extractEmployeeNames(text).some((name) => !samePerson(name, card.employeeName!))) return false;
  const intent = detectTemplateIntent(text);
  if (intent.kind === "explicit" && intent.templateKey !== card.templateKey) return false;
  return aboutThisPerson(text, card.employeeName!) && (describesIncident(account) || pastClause(account, card.employeeName!));
}

export function withAccountBeforeRequest<T extends { content: string; formProposal?: Card | null }>(answer: T, turns: readonly Turn[]): T {
  const card = answer.formProposal;
  if (!accountBeforeRequestEnabled() || !card?.employeeName || card.sourceMessageIds.length === 0) return answer;
  const manager = turns.filter((turn) => turn.role === "user" && turn.id);
  const cited = new Set(card.sourceMessageIds);
  const firstAt = manager.findIndex((turn) => cited.has(turn.id!));
  if (firstAt <= 0) return answer;
  const added: string[] = [];
  for (let index = firstAt - 1; index >= 0; index -= 1) {
    const turn = manager[index]!;
    if (cited.has(turn.id!) || !accountTurn(turn.content, card)) break;
    added.unshift(turn.id!);
  }
  if (added.length === 0) return answer;
  return { ...answer, formProposal: { ...card, sourceMessageIds: [...added, ...card.sourceMessageIds] } };
}
