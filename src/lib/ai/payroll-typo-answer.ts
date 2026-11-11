import { payrollTypoAnswerEnabled } from "@/lib/config/chat-quality-flags";
import { PAYROLL_DEDUCT_LABEL } from "@/lib/forms/payroll-deduct";
import { payrollAmountPrompt } from "@/lib/forms/payroll-deduct-amount";
import { isPayrollAnswer } from "@/lib/forms/payroll-words";

import type { AskRequest, AskResponse } from "./types";

/**
 * PAYROLL_TYPO_ANSWER_ENABLED (QA BF7b live, conv_mvqn7a6p2mm85ap, 27 Oct
 * 2026): the manager's "yes payrol ldeduct" answered "Is payroll deduct
 * applicable?" but the card set nothing on that turn, while "yes payroll
 * deduct" set Yes. PAYROLL_TYPO_NOT_A_NAME already reads such a turn as a
 * payroll answer (`payroll-words.ts`) — so it names nobody — but the payroll
 * reader does not. With the flag on, a card still asking the question takes
 * the yes or no of a turn that is only a payroll answer, typos included, and
 * reads it back as a stated answer is, with the amount question after a Yes.
 */
const ASKED = /^.*\*\*Is payroll deduct applicable\?\*\* Yes or No\?.*$/m;
const YES = /^\s*(?:yes|yeah|yep|yup|y)\b|\b(?:yes|yeah|yep|yup)[.!\s]*$/i;
const NO = /^\s*(?:no|nope|n)\b|\b(?:no|nope)[.!\s]*$/i;

export function withPayrollTypoAnswer(response: AskResponse, request: AskRequest): AskResponse {
  const proposal = response.formProposal;
  if (!payrollTypoAnswerEnabled() || !proposal || proposal.payrollDeduct || !ASKED.test(response.content)) return response;
  const turn = request.question;
  if (!isPayrollAnswer(turn)) return response;
  const answer = YES.test(turn) ? "yes" : NO.test(turn) ? "no" : null;
  if (!answer) return response;
  const history = (request.history ?? []) as readonly { role: string; content: string }[];
  const amount = payrollAmountPrompt({
    payroll: answer,
    managerText: turn,
    assistantMessages: history.filter((message) => message.role === "assistant").map((message) => message.content),
  });
  const line = `${PAYROLL_DEDUCT_LABEL} **${answer === "yes" ? "Yes" : "No"}** — tell me if that should change.${amount ? `\n\n${amount}` : ""}`;
  return { ...response, content: response.content.replace(ASKED, line), formProposal: { ...proposal, payrollDeduct: answer } };
}
