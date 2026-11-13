import { COMPANY_JOB_TITLES } from "@/config/company/job-titles";
import { caAsksWhatHappenedEnabled } from "@/lib/config/chat-quality-flags";
import {
  NO_INCIDENT_NOTE,
  answeredWhatHappened,
  describesIncident,
  describesMoreThanTheRequest,
} from "@/lib/forms/corrective-action-intake";

import { aboutSomebodyElse, turnsForThisForm, withoutStateLead, type Turn } from "./coaching-what-happened";
import type { AskRequest, AskResponse } from "./types";

/**
 * ============================================================================
 * A CORRECTIVE ACTION CARD WITH NO ACCOUNT ASKS WHAT HAPPENED (CA_ASKS_WHAT_HAPPENED_ENABLED)
 * ============================================================================
 *
 * Ported from the sibling app's #331 (QA P1 there, 26 Oct 2026; on in its production) at Pau's direction, 13 Nov 2026.
 * "create corrective action form for <name>, Team Member Part Time" gave a Corrective Action card that asked nothing —
 * here too: the protected proposal reader counts the job title (or a store, or a level) as the account, so the
 * intake's own "You haven't told me what happened yet" note never showed, and the draft came back with no policy.
 *
 * With the flag on, a Corrective Action card for a named person with no account in the manager's turns for it carries
 * that note (`NO_INCIDENT_NOTE`, this app's wording), once per card. The account test is the Coaching card's
 * (`coaching-what-happened.ts`): a clause that says what the employee did, not about somebody else; the person's
 * name, job title and store are not an account. With the sibling's refinements, as they run in its production:
 *   - a duty not done is an account ("not signing off on the cleaning check list", "Not meeting sales requirements",
 *     "did not clock in"): the negation governs an action verb;
 *   - a denied fault is not ("not late", "she was never late", "didn't do anything wrong", "nothing happened"), also
 *     after the request's head ("ca for <name> not late").
 *
 * After the reply is built, outside the proposal flow; no field of the card changes. Off, the reply is as built.
 */

const CORRECTIVE = /corrective action/i;
const MARKER = "You haven't told me what happened yet";

/** Some negation: "not", "never", "nothing", "no incident", "n't". */
const NEGATED = /\b(?:not|never|nothing|no\s+(?:incident|issue|problems?|concerns?))\b|n['’]t\b/i;
/** Nothing happened at all: "nothing", "no incident". */
const NOTHING_HAPPENED = /\bnothing\b|\bno\s+(?:incident|issue|problems?|concerns?)\b/i;
/* A negation that denies a fault: what follows it within a few words is the fault denied (`draft-never-blank.ts`'s words). */
const EXONERATING =
  /\b(?:never|did\s+not|didn['’]?t|was\s+not|wasn['’]?t|has\s+not|hasn['’]?t|no)\b(?:\s+[\w']+){0,4}?\s+(?:late|tardy|problems?|issues?|wrong|trouble|complaints?|mistakes?|absent|concerns?)\b/i;
/** "not late", "not absent": a clause that starts with a bare "not" before a fault. */
const BARE_NOT_FAULT = /^\s*not\b(?:\s+[\w']+){0,2}?\s+(?:late|tardy|problems?|issues?|wrong|trouble|complaints?|mistakes?|absent|concerns?)\b/i;
/** The request's head: "ca for", "corrective action form for", "write-up for". */
const REQUEST_HEAD = /^.*?\b(?:corrective\s+action(?:\s+form)?|ca|c\/a|write[- ]?up|warning|dpoa)\s+(?:for|to)\s+/i;

function deniesAFault(text: string): boolean {
  return EXONERATING.test(text) || BARE_NOT_FAULT.test(text);
}

/*
 * Only what did not happen: a negation that denies a fault ("not late", "she was never late", "didn't do anything
 * wrong") or says nothing happened. A negation before a duty ("not signing off on the cleaning check list", "did not
 * clock in", "Not meeting sales requirements") names no fault word, so it stays an account. (The sibling reads "never
 * <verb>" as a duty not done, so "she was never late" counted as an account there; here the fault word decides.)
 */
function onlyWhatDidNotHappen(clause: string): boolean {
  return NEGATED.test(clause) && (deniesAFault(clause) || NOTHING_HAPPENED.test(clause));
}

/** "ca for <name> not late": without the request's head and the name, only a denial. */
function onlyADenialAfterRequest(clause: string, name: string): boolean {
  if (!REQUEST_HEAD.test(clause)) return false;
  const own = new Set(name.toLowerCase().split(/\s+/).filter(Boolean));
  const words = clause.replace(REQUEST_HEAD, "").split(/\s+/).filter(Boolean);
  while (words.length > 0 && own.has(words[0]!.toLowerCase().replace(/[^\p{L}'’-]/gu, ""))) words.shift();
  const rest = words.join(" ").trim();
  return rest !== "" && (deniesAFault(rest) || NOTHING_HAPPENED.test(rest));
}

/*
 * WHO AND WHERE ARE NO ACCOUNT. This roster's positions ("Team Member Part Time", "Assistant General Manager") are not
 * all in the company title list, and the protected reader puts one on the card as the Issue ("**Issue:** Team Member
 * Part Time"), which then counts as an account everywhere after it. A clause is read without the company's titles,
 * the employee's own title and these position words before it is tested.
 */
const POSITION_WORDS = /\b(?:assistant\s+)?general\s+managers?\b|\b(?:part|full)[- ]time\b|\bagms?\b|\bgms?\b/gi;

function withoutTitles(clause: string, ignore: readonly string[]): string {
  let rest = clause;
  for (const said of ignore) {
    if (said.trim()) rest = rest.replace(new RegExp(said.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  for (const entry of COMPANY_JOB_TITLES) rest = rest.replace(new RegExp(entry.pattern.source, "gi"), " ");
  return rest.replace(POSITION_WORDS, " ").replace(/\s{2,}/g, " ").trim();
}

/*
 * A FIGURE IS AN ACCOUNT (Gate-Bubbles on #857, 13 Nov 2026): "Odalys Fenmarrow 131 tans verbal" states a shortfall
 * by its count. A number followed by a word (not a time or an ordinal) says what the employee did or did not reach.
 */
const FIGURE = /\b\d+(?:\.\d+)?%?\s+(?!(?:am|pm|st|nd|rd|th)\b)[a-z]{3,}\b/i;

/** A clause that says what this employee did. */
export function hasAccount(said: string, name: string, ignore: readonly string[]): boolean {
  return said
    // "not late but left the register open": the part after "but" is its own clause, and says what happened.
    .split(/[\n.;,]+|\s+(?:and|but)\s+/i)
    .map((clause) => withoutTitles(clause.trim(), [...ignore].filter((item) => item !== name)))
    .filter((clause) => /\p{L}{2,}/u.test(clause))
    .some(
      (clause) =>
        !onlyWhatDidNotHappen(clause) &&
        !onlyADenialAfterRequest(clause, name) &&
        !aboutSomebodyElse(clause, name) &&
        (describesIncident(clause) || FIGURE.test(clause) || describesMoreThanTheRequest(clause, { ignore })),
    );
}

/**
 * WHAT_HAPPENED_NO_CREATE_ENABLED reads this (Gate-Bubbles on #857, 13 Nov 2026): the manager's turns for the card
 * already say what happened, though the reply asks — "Didn't show up for her opening shift", "she was late on
 * 10-20-26" in an earlier turn, "131 tans". Then Create stays.
 */
export function managerGaveAccount(
  card: { templateKey?: string; employeeName?: string | null; employeeRole?: string | null; locationName?: string | null },
  question: string,
  history: readonly Turn[],
): boolean {
  const name = card.employeeName?.trim();
  if (!name || !card.templateKey) return false;
  const turns = turnsForThisForm(history, card.templateKey);
  const said = [...turns.filter((turn) => turn.role === "user").map((turn) => turn.content), question].map(withoutStateLead).join("\n");
  return hasAccount(said, name, [name, card.employeeRole ?? "", card.locationName ?? ""]);
}

export function withCaWhatHappened(response: AskResponse, request: AskRequest): AskResponse {
  if (!caAsksWhatHappenedEnabled()) return response;
  return askCaWhatHappened(response, request.question, request.history as readonly Turn[]);
}

export function askCaWhatHappened(response: AskResponse, question: string, history: readonly Turn[]): AskResponse {
  const proposal = response.formProposal;
  if (!proposal || !(proposal.templateKey === "dpoa" || CORRECTIVE.test(proposal.templateName ?? ""))) return response;
  if (proposal.subject === "team") return response;
  const name = proposal.employeeName?.trim();
  if (!name) return response;
  const turns = turnsForThisForm(history, proposal.templateKey);
  const said = [...turns.filter((turn) => turn.role === "user").map((turn) => turn.content), question].map(withoutStateLead).join("\n");
  const ignore = [name, proposal.employeeRole ?? "", proposal.locationName ?? ""];
  if (hasAccount(said, name, ignore)) return response;
  if (answeredWhatHappened([...history, { role: "user", content: question }])) return response;
  // The card's Issue, when it is only who and where ("Team Member Part Time"), is no account: it goes, with its line,
  // also when the card already asks (else the Issue line reads as the account and the ask is taken back).
  const issue = proposal.issue?.trim() ?? "";
  const dropIssue = issue !== "" && !hasAccount(issue, name, ignore);
  const content = dropIssue ? withoutIssueLine(response.content) : response.content;
  const card = dropIssue ? { ...proposal, issue: null } : proposal;
  // Once per card: asked before (or already asking), never added again.
  const askedBefore = turns.some((turn) => turn.role === "assistant" && turn.content.includes(MARKER));
  if (content.includes(MARKER) || askedBefore) return dropIssue ? { ...response, content, formProposal: card } : response;
  const lines = content.split("\n");
  // Second, after the card's opening line, where the card puts it on a name alone.
  lines.splice(Math.min(1, lines.length), 0, "", NO_INCIDENT_NOTE);
  return { ...response, content: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), formProposal: card };
}

/** "**Issue:** Team Member Part Time · **Store:** …" → "**Store:** …"; a line that is only the Issue goes. */
function withoutIssueLine(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/^(\s*)\*\*Issue:\*\*[^\n·]*?(?:\s+·\s+|$)/, "$1"))
    .filter((line, index, all) => line.trim() !== "" || all[index - 1]?.trim() !== "")
    .join("\n");
}
