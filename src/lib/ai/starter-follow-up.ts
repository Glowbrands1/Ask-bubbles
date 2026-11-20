import { starterFollowUpExampleEnabled } from "@/lib/config/chat-quality-flags";

import type { AskRequest, AskResponse } from "./types";

/**
 * ============================================================================
 * A STARTER QUESTION'S FOLLOW-UP IS EASY TO ANSWER (STARTER_FOLLOW_UP_EXAMPLE_ENABLED; port from the sibling app's #1127, #1150)
 * ============================================================================
 *
 * QA item 24 (the sibling app's production audit, 20 Nov 2026): managers tapped a home starter with nothing else said; the
 * app asked who, or which, and managers left. The live re-test of the first fix (#1150) found the who-question matched
 * too narrowly ("for?" right after a bolded form name) and a starter chip that was not keyed. Here, from the start:
 * every starter in this app's own list (`QUICK_QUESTIONS`, `config/company/assistant.ts`) that is answered with a who
 * or which question is keyed, and the who-question is any "Who is this / it … for …?" sentence, bold or not.
 *
 * With the flag on, when one of those starters is the chat's first message and the reply asks who or which, the reply
 * ends with one short example answer. Keyed to the app's own starter texts, never to a manager's own words. Off, as
 * before.
 */
export const COACHING_STARTER = "Create a coaching form.";
export const CONVERSATION_STARTER = "Help me prepare for a conversation with a team member.";
export const INGREDIENT_STARTER = "What should I tell a guest who asks about an ingredient?";

/** "Who is this Coaching Form for?", "Who is this **Coaching Form** for, and what's it about?", "Who is it for?". */
const WHO_QUESTION = /\bwho is (?:this|it)\b[^?\n]*?\bfor\b[^?\n]*\?/i;
/** The conversation starter names no form: "Who is the conversation with?", "Which team member is it?" also ask who. */
const WHO_ANY = /\bwho\b[^?\n]*\?|\bwhich (?:team member|employee|person)\b[^?\n]*\?/i;
/** "Which ingredient is the guest asking about?", "What's the ingredient?". */
const WHICH_QUESTION = /\b(?:which|what)\b[^?\n]*\?/i;

interface Starter {
  readonly text: string;
  /** The question the reply asks that the example answers. */
  readonly asks: RegExp;
  readonly example: string;
  /** Only when the reply showed nothing (no source): a reply that answered needs no example. */
  readonly onlyWhenNothingShown?: boolean;
  /** Only when the card names nobody yet (the form's who-question). */
  readonly onlyWithoutPerson?: boolean;
}

const STARTERS: readonly Starter[] = [
  { text: COACHING_STARTER, asks: WHO_QUESTION, example: 'For example: "coaching for <name> on being late to open the store".', onlyWithoutPerson: true },
  { text: CONVERSATION_STARTER, asks: WHO_ANY, example: 'For example: "a conversation with <name> about being late to open the store".', onlyWithoutPerson: true },
  { text: INGREDIENT_STARTER, asks: WHICH_QUESTION, example: 'For example: "a guest with sensitive skin asks what is in a bar of soap".', onlyWhenNothingShown: true },
];

/** The starters this step answers (for the test that keeps them in step with `QUICK_QUESTIONS`). */
export const STARTER_TEXTS = STARTERS.map((starter) => starter.text);

/**
 * The reply with the starter's example answer at its end, or the reply unchanged. `firstMessage`: the starter is the
 * chat's first manager message. `namesPerson`: a card this turn names its person. `showedSomething`: the reply carries
 * sources.
 */
export function starterExampleText(
  content: string,
  question: string,
  context: { readonly firstMessage: boolean; readonly namesPerson: boolean; readonly showedSomething: boolean },
): string {
  if (!starterFollowUpExampleEnabled() || !context.firstMessage) return content;
  const starter = STARTERS.find((entry) => entry.text === question.trim());
  if (!starter || content.includes(starter.example)) return content;
  if (starter.onlyWithoutPerson && context.namesPerson) return content;
  if (starter.onlyWhenNothingShown && context.showedSomething) return content;
  if (!starter.asks.test(content)) return content;
  return `${content.trimEnd()}\n\n${starter.example}`;
}

/** The chat's step (server-ask.ts, applied last). */
export function withStarterFollowUp(response: AskResponse, request: AskRequest): AskResponse {
  const content = starterExampleText(response.content, request.question, {
    firstMessage: !(request.history ?? []).some((turn) => turn.role === "user"),
    namesPerson: Boolean(response.formProposal?.employeeName),
    showedSomething: (response.citations?.length ?? 0) > 0,
  });
  return content === response.content ? response : { ...response, content };
}
