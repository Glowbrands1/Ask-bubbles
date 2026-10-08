import { QUICK_QUESTIONS, type QuickQuestion } from "@/config/company/assistant";
import type { AccessScope, Permission } from "@/types";

/**
 * The starter questions a person is offered, filtered by what they may do and
 * the breadth of their assignment. The list itself is company configuration
 * (`src/config/company/assistant.ts`).
 */
export { QUICK_QUESTIONS };
export type { QuickQuestion };

export function quickQuestionsFor(input: {
  readonly scope: AccessScope;
  readonly can: (permission: Permission) => boolean;
}): string[] {
  const level = input.scope.level;
  return QUICK_QUESTIONS.filter((question) => {
    if (question.levels !== null && !question.levels.includes(level)) return false;
    return question.needs === null || input.can(question.needs);
  }).map((question) => question.text);
}
