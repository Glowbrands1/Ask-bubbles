import { statedTitleWinsEnabled } from "@/lib/config/chat-quality-flags";

import { copularJobTitle } from "./title-words";
import type { AskResponse } from "./types";

/**
 * ============================================================================
 * THE CARD KEEPS THE TITLE THE MANAGER STATED (STATED_TITLE_WINS_ENABLED)
 * ============================================================================
 *
 * QA history, conv_mvjyhx8z2ayo9ku (22 Oct 2026): "create a verbal corrective
 * action for <name>, team member at dodge for violating dress code on
 * 10-20-26" came back "You described <name> as a Team Member, but Woven lists
 * their job title as **Human Resources Generalist**, so the form uses **Human
 * Resources Generalist**." The proposal flow (forms/employee-verification.ts
 * with ai/form-proposal.ts) puts Woven's verified title on the card over the
 * one the manager typed.
 *
 * With the flag, where that sentence is in the reply and the card carries
 * Woven's title from it, the card carries the manager's title instead, and the
 * sentence names Woven's and asks which is right. The sentence is the proposal
 * flow's own reading of both titles, so nothing is re-read here.
 *
 * A title the proposal flow's list does not hold ("she is an HR assistant",
 * QA 25 Oct 2026, read by `copularJobTitle` from the manager's turns) gets
 * no such sentence: the card carried Woven's title with "**Position:** …, from
 * Woven". The card then carries the manager's, and that line names Woven's
 * and asks the same way. Anything else, and flag off: unchanged.
 */
const OVERRIDE =
  /You described \*\*([^*\n]+)\*\* as an? ([^\n]+?), but Woven lists their job title as \*\*([^*\n]+)\*\*, so the form uses \*\*\3\*\*\./;

export function withStatedTitleOnCard(response: AskResponse, managerText = ""): AskResponse {
  const proposal = response.formProposal;
  if (!statedTitleWinsEnabled() || !proposal) return response;
  if (proposal.employeeRoleSource !== "woven" || !proposal.employeeRole) return response;
  const woven = proposal.employeeRole;
  const keep = (name: string, stated: string) =>
    `You described **${name}** as ${article(stated)} ${stated}; Woven lists their job title as **${woven}**. The form keeps **${stated}**, the title you gave — tell me if it should be **${woven}**.`;
  const kept = (content: string, stated: string) => ({
    ...response,
    content,
    formProposal: { ...proposal, employeeRole: stated, employeeRoleSource: "manager" as const },
  });

  const found = OVERRIDE.exec(response.content);
  if (found) {
    const [sentence, name, stated, said] = found as unknown as [string, string, string, string];
    return said === woven ? kept(response.content.replace(sentence, keep(name, stated)), stated) : response;
  }

  const stated = copularJobTitle(managerText, proposal.employeeName);
  if (!stated || !proposal.employeeName || stated.toLowerCase() === woven.toLowerCase()) return response;
  const readBack = `**Position:** ${woven}, from Woven — tell me if that has changed and I'll flag it for review.`;
  const sentence = keep(proposal.employeeName, stated);
  const content = response.content.includes(readBack)
    ? response.content.replace(readBack, sentence)
    : `${response.content}\n\n${sentence}`;
  return kept(content, stated);
}

/** "an HR Assistant", "a Team Member": an initialism by its first letter's sound. */
function article(title: string): string {
  const first = title.trim().split(/\s+/)[0] ?? "";
  if (first.length > 1 && first === first.toUpperCase()) return /^[AEFHILMNORSX]/.test(first) ? "an" : "a";
  return /^[aeiou]/i.test(first) ? "an" : "a";
}
