import { answerNotANameEnabled, dateAnswerAppliedEnabled, storeWordNotANameEnabled } from "@/lib/config/chat-quality-flags";

import { readLocationMentions } from "./location-mention";
import { isPayrollWords } from "./payroll-words";

/*
 * The same words as `isDateAnswerWords` in `incident-dates.ts`, held here
 * because that module imports `proposal.ts` and this one is imported by it
 * (see `import-cycles.test.ts`).
 */
const DATE_ANSWER_WORDS = /^(?:the\s+)?(?:most\s+recent|latest|newest|last(?:\s+(?:one|date))?|first(?:\s+one)?|earliest|oldest|second(?:\s+one)?)$/i;

function isDateAnswer(name: string): boolean {
  return dateAnswerAppliedEnabled() && DATE_ANSWER_WORDS.test(name.trim());
}

/** STORE_WORD_NOT_A_NAME_ENABLED: "dodge" — a reply that is only a store's name — is the store. */
function isStoreReply(name: string): boolean {
  if (!storeWordNotANameEnabled()) return false;
  const typed = name.trim().toLowerCase();
  return readLocationMentions(typed).some((mention) => !mention.confirm && (mention.matched ?? "").trim().toLowerCase() === typed);
}

/**
 * ============================================================================
 * AN ANSWER TO THE APP'S QUESTION NAMES NOBODY
 * ============================================================================
 *
 * QA BF7 (ported from the sibling app's ANSWER_NOT_A_NAME, 27 Oct 2026): "yes
 * payrol ldeduct" answering the payroll question became the employee, and
 * "dodge" answering the store question became the employee. With
 * ANSWER_NOT_A_NAME_ENABLED a candidate that is only payroll wording or only a
 * date answer is not a name; with STORE_WORD_NOT_A_NAME_ENABLED one that is
 * only a store's name is not either. Off, every candidate is kept: main.
 */
export function namesSomebody(name: string): boolean {
  if (answerNotANameEnabled() && (isPayrollWords(name) || isDateAnswer(name))) return false;
  return !isStoreReply(name);
}
