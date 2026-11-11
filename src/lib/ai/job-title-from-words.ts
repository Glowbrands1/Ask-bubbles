import { exitReadbackJobTitleEnabled, jobTitleAppositionEnabled, jobTitleFromWordsEnabled } from "@/lib/config/chat-quality-flags";
import { POSITION_QUESTION_TAG, positionAlreadyAsked, positionAnsweredIn, positionQuestion } from "@/lib/forms/employee-position";

import type { AskRequest, AskResponse } from "./types";

/**
 * JOB_TITLE_FROM_WORDS_ENABLED (QA item 3, 27 Oct 2026): "ivy was a tanning
 * consultant at dodge location" left the exit form's Job Title empty — the
 * title reader knows only this company's titles — and an exit form never asks
 * for the position. With the flag on, a title the manager typed in "<who> is /
 * was a <title>" or "position is <title>" is the card's Job Title, as typed,
 * whatever company it reads like; with none typed and none on record, an exit
 * form asks for it once, as the Corrective Action and Coaching cards already
 * do (`employee-position.ts`).
 *
 * Only an empty Job Title is filled: a title from the directory or this
 * company's list stays as the card has it. After the reply is built, outside
 * the proposal flow.
 */

/** Ends in a word that names a job, so "was a no call no show" is not a title. */
const ROLE_NOUN =
  /\b(?:associate|consultant|lead|manager|director|maker|member|cashier|supervisor|keyholder|key\s+holder|trainee|specialist|assistant|clerk|representative|rep|coordinator|stylist|technician|attendant|host|agent|trainer)$/i;
const IS_A = (who: string) =>
  new RegExp(`\\b(?:she|he|they|${who})\\s+(?:is|was|works\\s+as|worked\\s+as)\\s+(?:an?|our|the)\\s+((?:[a-z][a-z'’-]*\\s+){0,3}[a-z][a-z'’-]*)`, "gi");
/** JOB_TITLE_APPOSITION_ENABLED: "<name>, makery associate at kearney", the title set off by a comma right after the name (QA S12). */
const APPOSITION = (who: string) =>
  new RegExp(`\\b(?:${who}),\\s+((?:[a-z][a-z'’-]*\\s+){0,3}[a-z][a-z'’-]*)`, "gi");
const LABELED = /\b(?:job\s+title|position|title|role)\s*(?:is|was|:|-)\s*(?:an?\s+|the\s+)?((?:[a-z][a-z'’-]*\s+){0,3}[a-z][a-z'’-]*)/gi;
const STOP_AFTER = /\s+(?:at|in|for|from|on|and|who|that|with|since)\b.*$/i;

/** Templates whose card asks for the position here; the others ask in the proposal flow. */
const ASKS_HERE = new Set(["resignation-exit"]);

function titleCase(phrase: string): string {
  return phrase
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The last job title the manager typed for this employee in their own turns, or null. */
export function typedJobTitle(turns: readonly string[], name: string): string | null {
  const parts = name.trim().split(/\s+/).map(escaped);
  const who = [parts.join("\\s+"), parts[0]].filter(Boolean).join("|");
  let found: string | null = null;
  for (const turn of turns) {
    for (const pattern of [IS_A(who), ...(jobTitleAppositionEnabled() ? [APPOSITION(who)] : []), LABELED]) {
      for (const match of turn.matchAll(pattern)) {
        const phrase = match[1]!.replace(STOP_AFTER, "").trim();
        if (ROLE_NOUN.test(phrase)) found = titleCase(phrase);
      }
    }
  }
  return found;
}

/**
 * EXIT_READBACK_JOB_TITLE_ENABLED (QA, 27 Oct 2026): the exit form's read-back
 * is written before the title is filled, so it said "Left blank for you to
 * review: Job Title" while the card and the draft had it. With the flag on, the
 * read-back lists the Job Title under the Name and leaves it off the blank list.
 */
export function withJobTitleReadBack(content: string, title: string): string {
  if (!/^\*\*Left blank for you to review:\*\* Job Title\b/m.test(content)) return content;
  return content
    .replace(/^(- \*\*Name:\*\* [^\n]+)$/m, (line) => `${line}\n- **Job Title:** ${title}`)
    .replace(/^(\*\*Left blank for you to review:\*\* )Job Title(?:, | and )/m, "$1");
}

type Turn = { readonly role: string; readonly content: string };

export function withJobTitleFromWords(response: AskResponse, request: AskRequest): AskResponse {
  if (!jobTitleFromWordsEnabled()) return response;
  const proposal = response.formProposal;
  if (!proposal?.employeeName || proposal.subject === "team" || proposal.employeeRole) return response;
  const history = (request.history ?? []) as readonly Turn[];
  const managerTurns = [...history.filter((turn) => turn.role === "user").map((turn) => turn.content), request.question];
  const title = typedJobTitle(managerTurns, proposal.employeeName) ?? positionAnsweredIn([...history, { role: "user", content: request.question }]);
  if (title) {
    // The position question this reply asked is answered by what they typed.
    const content = response.content
      .split("\n")
      .filter((line) => !line.includes(POSITION_QUESTION_TAG))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return {
      ...response,
      content: exitReadbackJobTitleEnabled() ? withJobTitleReadBack(content, title) : content,
      formProposal: { ...proposal, employeeRole: title, employeeRoleSource: "manager" },
    };
  }
  if (!ASKS_HERE.has(proposal.templateKey) || positionAlreadyAsked(history) || response.content.includes(POSITION_QUESTION_TAG)) return response;
  return { ...response, content: `${response.content.trim()}\n\n${positionQuestion(proposal.employeeName)}` };
}
