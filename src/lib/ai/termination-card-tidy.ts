import { terminationCardTidyEnabled } from "@/lib/config/chat-quality-flags";

import type { AskResponse } from "./types";

/*
 * ============================================================================
 * A HEDGE ABOUT TERMINATING IS NEVER THE ISSUE (TERMINATION_CARD_TIDY_ENABLED)
 * ============================================================================
 *
 * QA's 17o live notes (12 Nov 2026, main 815ae303): "CA for <A>, do not terminate yet, she was late" made the card's
 * Issue "do not terminate yet" — the account, "she was late", was lost from the Issue though the Policy line read it as
 * late. With the flag on, an Issue that is only a clause about terminating (never a statement: it ticks nothing) is
 * replaced by the request's other clauses after the employee's name, the account. The card's Issue line and its
 * `issue` both. A request with no other clause keeps its Issue. Off, the card as built. Pure.
 *
 * (The same flag spaces the termination Action plan line from the line after it: `ai/termination-stated.ts`.)
 */

const ABOUT_TERMINATING = /\bterminat|\bterm\s+(?:ca|c\/a)\b|\btermination\b/i;
const ISSUE_SEGMENT = /(\*\*Issue:\*\*\s*)([^·\n]+?)(\s*(?:·|\n|$))/;

/** The request's clauses after the employee's name that do not talk about terminating: the account. */
function accountClauses(question: string, employee: string): string | null {
  const at = question.toLowerCase().indexOf(employee.toLowerCase());
  const after = at >= 0 ? question.slice(at + employee.length) : question;
  const clauses = after
    .split(/[,;]|(?<=[.!?])\s+/)
    .map((clause) => clause.trim().replace(/[.!?]+$/, ""))
    .filter((clause) => clause !== "" && !ABOUT_TERMINATING.test(clause));
  return clauses.length > 0 ? clauses.join(", ") : null;
}

/** The card's Issue as the account, when it was only a clause about terminating. Off, unchanged. */
export function withIssueNotTerminationHedge(answer: AskResponse, question: string): AskResponse {
  if (!terminationCardTidyEnabled()) return answer;
  const card = answer.formProposal;
  const issue = card?.issue?.trim();
  if (!card || !issue || !card.employeeName || !ABOUT_TERMINATING.test(issue)) return answer;
  // Only a clause about terminating, nothing else: "do not terminate yet", "might terminate".
  if (issue.split(/[,;]/).some((clause) => clause.trim() !== "" && !ABOUT_TERMINATING.test(clause))) return answer;
  const account = accountClauses(question, card.employeeName);
  if (!account) return answer;
  const content = answer.content.replace(ISSUE_SEGMENT, (_all, lead: string, _old: string, tail: string) => `${lead}${account}${tail}`);
  return { ...answer, content, formProposal: { ...card, issue: account } };
}
