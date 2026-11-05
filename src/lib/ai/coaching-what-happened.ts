import { coachingAsksWhatHappenedEnabled } from "@/lib/config/chat-quality-flags";
import { answeredWhatHappened, describesIncident, describesMoreThanTheRequest } from "@/lib/forms/corrective-action-intake";
import type { ChatFormProposal } from "@/types";

import type { AskRequest, AskResponse } from "./types";

/**
 * COACHING_ASKS_WHAT_HAPPENED_ENABLED (Pau, 5 Nov 2026, sf-s27; ported from
 * the sibling app, default off): "Create a coaching form." → "<name>"
 * answered "Everything I need is here, drawn from your messages above. … I
 * have the employee and the store." with no incident. A Coaching Form card for
 * a person with no account in the manager's turns for it (a clause that says
 * what the employee did, not only what did not happen, and not about somebody
 * else; the person's name, job title and store are not an account) never says
 * it has everything: those sentences go, and it asks what happened, once per
 * card. The question opens with the Corrective Action intake's marker, so the
 * next reply is read as the account (`answeredWhatHappened`).
 */

const MARKER = "You haven't told me what happened yet";

export const COACHING_WHAT_HAPPENED_NOTE = `**${MARKER}.** What happened, or what should this coaching cover? Tell me here and I'll draft it from your words.`;

const SAYS_READY = /^Everything I need is here[^\n]*$/i;
// "I have the employee and the store (**<store>**)." — the store's name is optional.
const HAS_EMPLOYEE_AND_PLACE = /I have the employee and the store(?: \(\*\*[^*]+\*\*\))?\.\s*/gi;

interface Turn {
  readonly role: string;
  readonly content: string;
  readonly formProposal?: ChatFormProposal | null;
}

/** The sentences the intent read writes in front of a turn ("The employee is ….", "Incident: …."): the app's, not the manager's. */
const STATE_LEAD =
  /^\s*(?:(?:The form is the|The employee is|Job title:|It happened at|It happened on|Warning level:|Payroll amount:|Policy reference:|Incident:|The account continues)[^\n]*?\.(?=\s|$)\s*|(?:Payroll deduct applies|No payroll deduction)\.\s*)+/i;

function withoutStateLead(turn: string): string {
  return turn.replace(STATE_LEAD, "");
}

/** The manager's turns for this form: after the last card for a different form. */
function turnsForThisForm(history: readonly Turn[], templateKey: string): readonly Turn[] {
  let start = 0;
  for (const [index, turn] of history.entries()) {
    const key = turn.role === "assistant" ? turn.formProposal?.templateKey : null;
    if (key && key !== templateKey) start = index + 1;
  }
  return history.slice(start);
}

/** Only what did not happen: "she was not late", "nothing happened", "no incident", "she didn't do anything wrong". */
const NEGATED = /\b(?:not|never|nothing|no\s+(?:incident|issue|problems?|concerns?))\b|n['’]t\b/i;

const NOT_A_PERSON = new Set(["she", "he", "they", "the", "a", "an", "her", "his", "their", "our", "my", "this", "that", "it", "i", "we", "you", "and", "also", "then"]);

/** "rory vance was late today": somebody else did it. */
function aboutSomebodyElse(clause: string, name: string): boolean {
  const said = /^([a-z'’-]+)\s+([a-z'’-]+)\s+(?:was|is|were|did|didn['’]?t|has|had|left|came|showed|missed|skipped|forgot|called|got|took|clocked)\b/i.exec(clause.trim());
  if (!said) return false;
  const own = new Set(name.toLowerCase().split(/\s+/));
  const words = [said[1]!.toLowerCase(), said[2]!.toLowerCase()];
  return !words.some((word) => NOT_A_PERSON.has(word) || own.has(word));
}

/** A clause that says what this employee did. */
function hasAccount(said: string, name: string, ignore: readonly string[]): boolean {
  return said
    .split(/[\n.;,]+|\s+and\s+/i)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .some(
      (clause) =>
        !NEGATED.test(clause) &&
        !aboutSomebodyElse(clause, name) &&
        (describesIncident(clause) || describesMoreThanTheRequest(clause, { ignore })),
    );
}

export function withCoachingWhatHappened(response: AskResponse, request: AskRequest): AskResponse {
  if (!coachingAsksWhatHappenedEnabled()) return response;
  return askCoachingWhatHappened(response, request.question, request.history as readonly Turn[]);
}

export function askCoachingWhatHappened(response: AskResponse, question: string, history: readonly Turn[]): AskResponse {
  const proposal = response.formProposal;
  if (!proposal || proposal.templateKey !== "coaching" || proposal.subject === "team") return response;
  const name = proposal.employeeName?.trim();
  if (!name || response.content.includes(MARKER)) return response;
  const turns = turnsForThisForm(history, proposal.templateKey);
  if (turns.some((turn) => turn.role === "assistant" && turn.content.includes(MARKER))) return response;
  const said = [...turns.filter((turn) => turn.role === "user").map((turn) => turn.content), question].map(withoutStateLead).join("\n");
  const ignore = [name, proposal.employeeRole ?? "", proposal.locationName ?? ""];
  if (hasAccount(said, name, ignore)) return response;
  if (answeredWhatHappened([...history, { role: "user", content: question }])) return response;
  const lines = response.content
    .replace(HAS_EMPLOYEE_AND_PLACE, "")
    .split("\n")
    .filter((line) => !SAYS_READY.test(line.trim()));
  lines.splice(Math.min(1, lines.length), 0, "", COACHING_WHAT_HAPPENED_NOTE);
  return { ...response, content: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}
