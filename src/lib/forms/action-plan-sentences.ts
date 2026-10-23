import { employeeFirstName } from "./employee-reference";
import { policyNamesFromViolated, policyPhrase, type ActionPlanInput } from "./ca-action-plan";
import { CA_ACTION_PLAN_CLOSING } from "./required-closing";

/**
 * Pau's two-sentence Action Plan, written only when
 * ACTION_PLAN_SENTENCES_ENABLED is on.
 *
 * Management will review the policy with the employee. Then the required
 * closing. A payroll answer stays on its own field; it is not a third
 * sentence. The builder in `ca-action-plan.ts` is not changed.
 */

export function twoSentenceActionPlan(input: ActionPlanInput): string {
  const names = input.citedPolicies.length > 0 ? input.citedPolicies : policyNamesFromViolated(input.policyViolated);
  const who = employeeFirstName(input.employeeName) ?? "the employee";
  const review = `Management will review ${policyPhrase(names)} with ${who}.`;
  const closing = (input.closing?.trim() || CA_ACTION_PLAN_CLOSING).replace(/\s+/g, " ").trim();
  const ended = /[.!?]$/.test(closing) ? closing : `${closing}.`;
  return `${review} ${ended}`;
}

/**
 * Keeps the review sentence and the closing. A payroll sentence between
 * them stays on the payroll field, not in the plan.
 */
export function collapseToTwoSentences(plan: string): string {
  const sentences = actionPlanSentences(plan);
  if (sentences.length <= 2) return sentences.join(" ");
  const review = sentences.find((sentence) => /^Management will review\b/.test(sentence)) ?? sentences[0]!;
  const closing = sentences[sentences.length - 1]!;
  return `${review} ${closing}`;
}

/**
 * A check on a plan the builder already wrote. Used by the replay of that
 * builder. The draft route, when the flag is on, writes `twoSentenceActionPlan`
 * instead of collapsing the builder's payroll sentence after the fact.
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
