import { CA_ACTION_PLAN_CLOSING } from "./required-closing";

/**
 * Pau's action-plan rule, checked only when ACTION_PLAN_SENTENCES_ENABLED
 * is on.
 *
 * The plan is exactly two sentences: the review sentence, then the required
 * closing. The builder in `ca-action-plan.ts` is not changed. This counts
 * the sentences it produced and, when asked, drops any sentence that sits
 * between those two. A plan that cannot be made into two sentences is
 * reported invalid and left unwritten.
 */

function shieldDecimals(text: string): string {
  return text.replace(/(\d)\.(\d)/g, "$1\u0000$2");
}

export function actionPlanSentences(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  return shieldDecimals(trimmed)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\u0000/g, ".").trim())
    .filter(Boolean);
}

export function actionPlanSentenceCount(value: string): number {
  return actionPlanSentences(value).length;
}

function isClosing(sentence: string, closing: string): boolean {
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[.!?]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return normalize(sentence) === normalize(closing);
}

export function enforceTwoSentenceActionPlan(
  value: string,
  closing: string | null = CA_ACTION_PLAN_CLOSING,
): { value: string; valid: boolean } {
  const required = (closing?.trim() || CA_ACTION_PLAN_CLOSING).replace(/[.!?]+$/g, "") + ".";
  const count = actionPlanSentenceCount(value);
  if (count === 2) return { value: value.trim(), valid: true };
  const lead = actionPlanSentences(value).find((sentence) => !isClosing(sentence, required));
  if (!lead) return { value, valid: false };
  const repaired = `${lead.replace(/[.!?]+$/g, "")}. ${required}`;
  return actionPlanSentenceCount(repaired) === 2 ? { value: repaired, valid: true } : { value, valid: false };
}
