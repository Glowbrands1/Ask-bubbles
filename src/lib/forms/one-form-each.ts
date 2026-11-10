import { cardNamesEmployeeEnabled, oneFormEachPersonEnabled } from "@/lib/config/chat-quality-flags";

import { AFFIRMATIVE } from "./employee-match";
import { TEMPLATE_SEEDS } from "./library";
import { personRosterNames } from "./person-guard";
import { detectTemplateIntent } from "./template-intent";

/*
 * ============================================================================
 * "A COACHING FORM FOR <A>, <B>, AND <C>" IS ONE FORM EACH (ONE_FORM_EACH_PERSON_ENABLED; ported from the sibling app:
 * QA's P7 there, 10 Nov 2026; the people invented)
 * ============================================================================
 *
 * "Make me a coaching form for <A>, <B>, and <C> for not closing duties correctly" was answered for <A> alone; <B> and
 * <C> were never handled. QA's decision: one form each. With the flag on, the chat route reads the turn first
 * (`beforeTurn`): such a request is asked as the first person's request alone ("a coaching form for <A> for not closing
 * duties correctly"), so a first name two people share is asked first, and a plain "yes" to the "**Next:**" line after
 * a card is the next person's request, with the same reason, as a new request (never a change of the card on screen).
 * After the answer (`afterTurn`), the "**Next:**" line names the people still to do, by their roster names, while the
 * turn is about that form. This app has no TWO_FORMS_EACH_PERSON chain to ride on (the sibling's lives in its ask
 * path), so the route does both steps. Pure but for the roster read of the turn. Off, as before.
 *
 * CARD_NAMES_EMPLOYEE_ENABLED (same report): "I have the employee" on a card's reply names them (`withCardNamingEmployee`).
 */

const PERSON = String.raw`\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)?`;
/** "<lead> for <A>, <B>, and <C> <rest>": the list of two or more names after "for", and what follows it. */
const PEOPLE_LIST = new RegExp(
  String.raw`^(.*?\bfor\s+)(${PERSON}(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)${PERSON})+)(\s+(?:for|about|because|due\s+to|regarding)\b[^\n]*?)?\s*[.!]?$`,
  "u",
);
/** A word that names a form, not a person: "CA", "C/A", "coaching", "policy review", "warning". */
const FORM_WORD = /^(?:ca|c\/a|dpoa|coaching|coach|form|forms|policy|review|written|verbal|warning|write-?up)\b/i;
const NEXT_LINE = /^\*\*Next:\*\* an? (.+?) each for (.+?)(?:, for (.+?))?\. Say \*\*yes\*\* when this one is done and I'll start the next\.$/m;
const ASKS_WHO_IT_IS = /\bIs this for \*\*[^*]+\*\*\?|\bDid you mean\b/;

export interface Queue {
  /** The form's name as the line says it ("Coaching Form"). */
  readonly form: string;
  readonly people: readonly string[];
  /** "not closing duties correctly"; "" when none was given. */
  readonly reason: string;
}

interface CardLike {
  readonly templateKey?: string;
  readonly templateName?: string;
  readonly employeeName?: string | null;
}

type Turn = { readonly role: string; readonly content: string };

function formName(templateKey: string): string {
  return TEMPLATE_SEEDS.find((seed) => seed.key === templateKey)?.name ?? templateKey;
}

function article(name: string): string {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}

/** A request for one form for two or more people named in a list: the first person's request, and the rest queued. */
export function peopleRequest(question: string): { readonly first: string; readonly queue: Queue } | null {
  const match = PEOPLE_LIST.exec((question ?? "").trim());
  if (!match) return null;
  const intent = detectTemplateIntent(match[1]!);
  const templateKey = intent.kind === "explicit" ? intent.templateKey : intent.kind === "corrective_action" ? "dpoa" : null;
  if (!templateKey) return null;
  const people = match[2]!.split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map((name) => name.trim()).filter(Boolean);
  if (people.length < 2) return null;
  const rest = (match[3] ?? "").replace(/[.!]+$/, "");
  /*
   * ONE FORM, SEVERAL PEOPLE — NEVER SEVERAL FORMS (QA's round-16B gate, 10 Nov 2026): "coaching form for Avery
   * Testperson, CA for Jordan Testperson" and "…, CA for Jordan Testperson, and a policy review for Sam Rivera" ask
   * for different forms, one per person, and already get one card each; "CA" read as a second person queued Jordan
   * instead. A turn whose list or rest names a form is not this request.
   */
  if (people.some((name) => FORM_WORD.test(name) || detectTemplateIntent(name).kind !== "none")) return null;
  if (rest && detectTemplateIntent(rest).kind !== "none") return null;
  return {
    first: `${match[1]}${people[0]}${rest}`,
    queue: { form: formName(templateKey), people: people.slice(1), reason: rest.trim().replace(/^for\s+/i, "") },
  };
}

export function queueIn(content: string | undefined): Queue | null {
  const match = typeof content === "string" ? NEXT_LINE.exec(content) : null;
  if (!match) return null;
  const people = [...match[2]!.matchAll(/\*\*([^*]+)\*\*/g)].map((entry) => entry[1]!.trim());
  return people.length > 0 ? { form: match[1]!, people, reason: match[3] ?? "" } : null;
}

/**
 * A queued first name as the one roster person it can only be ("Corwin" → "Corwin Halsey"), so the next request names
 * them in full. Two or none on the roster, or no roster read this turn: as typed.
 */
function fullName(typed: string): string {
  if (/\s/.test(typed.trim())) return typed;
  const first = typed.trim().toLowerCase();
  const matches = [...new Set((personRosterNames() ?? []).filter((name) => name.trim().split(/\s+/)[0]!.toLowerCase() === first))];
  return matches.length === 1 ? matches[0]! : typed;
}

function listed(names: readonly string[]): string {
  const bold = names.map((name) => `**${name}**`);
  return bold.length <= 1 ? bold.join("") : `${bold.slice(0, -1).join(", ")} and ${bold[bold.length - 1]}`;
}

export function nextLine(queue: Queue): string {
  return `**Next:** ${article(queue.form)} ${queue.form} each for ${listed(queue.people.map(fullName))}${queue.reason ? `, for ${queue.reason}` : ""}. Say **yes** when this one is done and I'll start the next.`;
}

function lastAssistant(history: readonly Turn[]): string | undefined {
  return [...history].reverse().find((turn) => turn.role === "assistant")?.content;
}

/**
 * The turn as the route answers it, and the queue still to do after it; null when the turn is not part of a chain.
 * `fresh`: the request is a new one (the next person's), so it is asked without the card on screen.
 */
export function beforeTurn(input: { readonly question: string; readonly history: readonly Turn[] }): { readonly question: string; readonly queue: Queue; readonly fresh: boolean } | null {
  if (!oneFormEachPersonEnabled()) return null;
  const asked = peopleRequest(input.question);
  if (asked) return { question: asked.first, queue: asked.queue, fresh: false };
  const last = lastAssistant(input.history);
  const queue = queueIn(last);
  if (!queue) return null;
  // A "yes" to "Is this for <X>?" or "Did you mean …?" confirms that person; only a yes after a card starts the next.
  if (AFFIRMATIVE.test(input.question) && !ASKS_WHO_IT_IS.test(last ?? "")) {
    const next = `Create ${article(queue.form)} ${queue.form} for ${queue.people[0]}${queue.reason ? ` for ${queue.reason}` : ""}.`;
    return { question: next, queue: { ...queue, people: queue.people.slice(1) }, fresh: true };
  }
  return { question: input.question, queue, fresh: false };
}

/** After the answer: the "**Next:**" line with the people still to do, while the turn is about that form. */
export function afterTurn<T extends { content: string; formProposal?: CardLike | null }>(answer: T, queue: Queue | null): T {
  if (!queue || queue.people.length === 0 || NEXT_LINE.test(answer.content)) return answer;
  const card = answer.formProposal;
  const sameForm = card?.templateKey ? formName(card.templateKey) === queue.form : ASKS_WHO_IT_IS.test(answer.content);
  if (!sameForm) return answer;
  return { ...answer, content: `${answer.content.trim()}\n\n${nextLine(queue)}` };
}

/** CARD_NAMES_EMPLOYEE_ENABLED: "I have the employee" on a card's reply becomes "I have **<name>**". Off, as before. */
export function withCardNamingEmployee<T extends { content: string; formProposal?: CardLike | null }>(answer: T): T {
  if (!cardNamesEmployeeEnabled()) return answer;
  const employee = answer.formProposal?.employeeName?.trim();
  if (!employee || !/\bI have the employee\b/.test(answer.content)) return answer;
  return { ...answer, content: answer.content.replace(/\bI have the employee\b/g, `I have **${employee}**`) };
}
