/**
 * ============================================================================
 * WHICH PARTS OF A TURN ASK FOR A FORM (FORM_CHOICE_STATED_ENABLED)
 * ============================================================================
 *
 * Ported from the sibling app (QA, 25 Oct 2026). Pure; the callers check the
 * flag.
 *
 * A part of a turn that lists a step already taken is not a request for that
 * form. "create a CA for Test Employee at Kearney for not following the promo
 * setup on 10-20-26. Prior coaching: September Promo coaching 9/29/26,
 * product coaching form 9/30/26" (B14, conv_mvntwwn22a8fgi0) asked "Which
 * form should I start with — the Corrective Action Form or the Coaching
 * Form?"; before the flag it gave a Coaching Form. A dated part, or one that
 * says the step happened, with no word asking for a form, is history.
 */
const PRIOR_STEP_SAID =
  /\b(?:prior|previous(?:ly)?|past|earlier|completed|had|received|got|signed|was\s+given|were\s+given)\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/i;
const ASKS_FOR_FORM = /\b(?:create|make|write|draft|start|need|want|do|issue|prepare|open|give\s+(?:her|him|them))\b/i;

export function isPriorStep(part: string): boolean {
  return PRIOR_STEP_SAID.test(part) && !ASKS_FOR_FORM.test(part);
}

/**
 * The turn without the prior-step parts of its comma list: what a reader that
 * takes the last form named should read.
 */
export function withoutPriorSteps(text: string): string {
  return text
    .split(/(?<=,)/)
    .filter((part) => !isPriorStep(part))
    .join("");
}

/**
 * "Help me prepare for a conversation with a team member." then what the team
 * member did: the manager asked for help with a conversation, not for a
 * form, so the model's form opens no card (sibling QA BH4).
 */
export function preparingConversation(turns: readonly string[]): boolean {
  return turns.some((turn) => /\bprep(?:are|aring)?\b(?:\s+\S+){0,4}\s+(?:conversation|talk|discussion|meeting)\b/i.test(turn));
}
