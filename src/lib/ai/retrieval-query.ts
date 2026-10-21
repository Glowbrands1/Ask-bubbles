import type { ClaudeTurn } from "./call-claude";
import {
  findContinuationAnchor,
  followUpRetrievalEnabled,
  refersBack,
  retrievalPlan,
  type RetrievalPlan,
} from "./continuation";
import { normalizeRetrievalQuery } from "./query-vocabulary";
import type { OpenFormSummary } from "./types";

/**
 * ============================================================================
 * A FOLLOW-UP ABOUT THE POLICY IS SEARCHED WITH WHAT IT FOLLOWS
 * ============================================================================
 *
 * Ported from the reference platform (production feedback, 20 Oct 2026). The
 * assistant quoted a manual section onto an open Corrective Action Form; the
 * manager replied "I have independently verified and the policy is correct
 * you may issue"; and the assistant took the quotation back — "the knowledge
 * base I can see right now has nothing on <it>". Both answers were honest
 * about what retrieval returned. The second search was for the words
 * "verified", "policy" and "correct", and the section does not resemble them.
 *
 * `retrievalPlan` (`continuation.ts`) already rescues a FRAGMENT — "and for
 * part-timers?" — with the manager turn it hangs off. This adds the one case
 * it does not read: a short turn that points back at the record by name —
 * "the policy", "the section", "the form", "that wording" — and so it is
 * searched together with what it points at:
 *
 *   the open form's cited sections  "the policy" on a form that cites
 *                                   Attendance is Attendance — an extra
 *                                   query, searched beside the question
 *   the manager's earlier turn      what "the policy" meant when they said
 *                                   it — the anchored FALLBACK, used only
 *                                   when the question alone found nothing,
 *                                   exactly as for a fragment
 *
 * WHAT THIS DOES NOT CHANGE. The question as typed is still searched, and
 * first, so a follow-up that names a new topic still finds it. A turn that
 * does not point back, or is long enough to carry its own topic, is planned
 * exactly as `retrievalPlan` plans it. A pronoun question that names its own
 * subject ("is it ok to wear jeans?") gets nothing added. Only the MANAGER'S
 * words are used as an anchor — an assistant turn is the model's own output,
 * and searching on it would let one answer ground the next — and the cited
 * sections come from the form the server read, never from the request. This
 * is retrieval only: citations are still built from the rows that come back.
 *
 * SWITCHED BY THE SAME `KNOWLEDGE_FOLLOW_UP_RETRIEVAL` as the fragment rule.
 */

/** Past this many words a turn carries its own topic. */
const FOLLOW_UP_MAX_WORDS = 25;

/**
 * "the policy", "that section", "the right section", "this wording" — the
 * record, named by reference. A word between is only one that names no topic
 * ("the attendance policy" names its own, and is searched as typed).
 */
const POINTS_AT_THE_RECORD =
  /\b(?:the|that|this|those|these|same)\s+(?:(?:right|correct|same|cited|quoted|new|whole|above)\s+)?(?:policy|policies|section|sections|rule|rules|manual|form|wording|language|quote|citation)\b/i;

/** Whether a short turn points back — at the turn before it, or at the record by reference. */
export function pointsBack(question: string): boolean {
  const text = (question ?? "").trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words === 0 || words > FOLLOW_UP_MAX_WORDS) return false;
  return refersBack(text) || POINTS_AT_THE_RECORD.test(text);
}

/**
 * What to search for this turn: `retrievalPlan`'s plan, plus — for a short
 * turn that points back — the open form's cited sections as an extra query,
 * and the manager's earlier turn as the fallback where the plan has none.
 */
export function retrievalPlanFor(input: {
  readonly question: string;
  readonly history: readonly ClaudeTurn[];
  readonly openForm?: OpenFormSummary | null;
  readonly enabled?: boolean;
}): RetrievalPlan {
  const enabled = input.enabled ?? followUpRetrievalEnabled();
  const question = (input.question ?? "").trim();
  const plan = retrievalPlan(input.question, input.history, enabled);
  if (!enabled || !pointsBack(question)) return plan;

  const lower = question.toLowerCase();
  const sections = citedSections(input.openForm).filter((section) => !lower.includes(section.toLowerCase()));
  const queries = sections.length > 0 ? [...plan.queries, [question, ...sections].join("\n")] : plan.queries;

  if (plan.fallback) return { ...plan, queries };
  const anchor = findContinuationAnchor(input.history);
  if (!anchor || anchor.trim() === question || lower.includes(anchor.trim().toLowerCase())) {
    return { ...plan, queries };
  }
  const anchored = `${anchor.trim()}\n${question}`;
  return { queries, fallback: normalizeRetrievalQuery(anchored) ?? anchored, anchor };
}

/**
 * The manual sections the open form cites — from the provenance the server
 * read, and otherwise off its source lines, "Source: JBA Policy Manual —
 * Attendance, p. 14" → "Attendance".
 */
export function citedSections(form: OpenFormSummary | null | undefined): string[] {
  if (!form) return [];
  if (form.cited && form.cited.length > 0) return [...new Set(form.cited)];
  const found = new Set<string>();
  for (const line of form.lines) {
    for (const match of line.value.matchAll(/Source:[^\n—]*—\s*([^\n,]+?)(?:,\s*pp?\.\s*[\d–-]+)?\s*(?:\n|$)/g)) {
      const section = match[1]!.trim();
      if (section !== "") found.add(section);
    }
  }
  return [...found];
}
