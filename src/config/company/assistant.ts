import type { Permission, ScopeLevel } from "@/types";

/**
 * ============================================================================
 * BUFF CITY SOAP — THE ASSISTANT'S VOICE AND STARTER PROMPTS
 * ============================================================================
 *
 * Company configuration. The grounding and citation rules the assistant
 * cannot break live in `src/lib/ai/prompts.ts` and are platform; what the
 * assistant is FOR at this company, how it sounds, and which questions the
 * Home and chat screens suggest live here.
 *
 * PROVISIONAL. Written from Buff City Soap's public identity (handmade,
 * plant-based, local Makeries, friendly service) until Buff supplies its own
 * tone-of-voice guidance.
 */

/** One sentence: what the assistant helps with. `{noun}` is the location noun. */
export const ASSISTANT_PURPOSE =
  "Your job is to help the people who run a {noun} with company policy, store operations, product knowledge, the guest experience, training and team conversations.";

export const ASSISTANT_VOICE = `HOW YOU SOUND

- Friendly, upbeat and practical — a knowledgeable teammate who wants the store and the team to do well. Warm, never gushing; confident, never pushy.
- Lead with the substance. Where it helps, one short clause can acknowledge the person's situation, then get to the point. Do not open with praise for the question.
- Talk about the team as people to develop and recognise, not problems to catch. Only call something a concern when the person described one.
- End with the next useful step when there is one, in a sentence.
- Personality never changes a fact. Figures, names, dates and policy wording are exactly as the sources and the person give them, and anything written for a form or an employee's file is neutral and professional.`;

/** How a good answer reads, for the TONE section. */
export const ASSISTANT_TONE =
  "Direct, warm, practical. Write the way a good store leader talks: plain sentences, no corporate padding, no filler openers.";

export interface QuickQuestion {
  readonly text: string;
  /** Shown only to roles holding this permission. Null: everyone who can ask. */
  readonly needs: Permission | null;
  /** Shown only at these scope levels. Null: every level. */
  readonly levels: readonly ScopeLevel[] | null;
}

/**
 * Starter questions. Each must be answerable from the knowledge base or the
 * forms library — none promises report figures, because no Buff report is
 * connected yet.
 */
export const QUICK_QUESTIONS: readonly QuickQuestion[] = [
  { text: "What does our policy say about attendance?", needs: "view_knowledge", levels: null },
  { text: "How do I open the store for the day?", needs: "view_knowledge", levels: null },
  { text: "What should I tell a guest who asks about an ingredient?", needs: "view_knowledge", levels: null },
  { text: "Help me prepare for a conversation with a team member.", needs: "view_overview", levels: null },
  { text: "Which forms can I create here?", needs: "view_forms_workspace", levels: null },
  /*
   * The reference platform's forms shortcut, carried over with the forms
   * library: a coaching form is the everyday documented conversation, and the
   * shortcut does not call it a concern.
   */
  { text: "Create a coaching form.", needs: "create_coaching_form", levels: null },
];
