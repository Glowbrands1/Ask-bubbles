import { priorSteps } from "./form-date-answer";
import { detectTemplateIntent } from "./template-intent";
import { warningLevelAndClauseEnabled } from "@/lib/config/chat-quality-flags";

import { levelInOwnClause } from "./warning-level-clause";
import { warningLevelFromTurns, type WarningLevel } from "./warning-level";

/*
 * Reading the level over a whole CONVERSATION needs to know which turns asked
 * for a form, so it needs the form-request reader. It lives here, not in
 * `warning-level.ts`, because `template-intent.ts` imports `warning-level.ts`:
 * with this function there, the two imported each other (QA, 22 Oct 2026).
 */

export interface WarningConversationTurn {
  role: string;
  content: string;
  error?: unknown;
}

/**
 * A turn that only lists what already happened ("prior coaching: verbal ca
 * 9-1-26") names a form without asking for one; it is not the start of
 * another form's turns, and cutting there lost the level stated in the
 * request before it (QA, 22 Oct 2026).
 */
function onlyHistory(text: string, today: string): boolean {
  return (
    priorSteps(text, today).length > 0 &&
    !/\b(?:create|make\s+(?:a|an|it)|start|draft|new|another|need\s+(?:a|an)|open|pull\s+up|write\s+up)\b/i.test(text)
  );
}

/**
 * The level the conversation stated for the form being proposed, or null.
 *
 * ONLY THIS FORM'S TURNS, by the rule `payrollDeductFromConversation` uses:
 * the look-back starts after the last manager turn that asked for a DIFFERENT
 * form request, so "written warning" said about somebody else's Corrective
 * Action earlier in the same chat is not carried onto this one. Assistant
 * turns never answer. A caller that has already cut the conversation to this
 * form's turns says so (`fromThisForm`), and it is not cut again: there, "she
 * had a written warning on 9/1" reads as a request for the form (it names
 * one), and cutting at it lost the level stated in the request before it (HR
 * feedback, 21 Oct 2026 — the same fix as the payroll answer's).
 */
export function warningLevelFromConversation(
  turns: readonly WarningConversationTurn[],
  today: string,
  options: { readonly fromThisForm?: boolean } = {},
): WarningLevel | null {
  const usable = turns.filter(
    (turn) => !turn.error && typeof turn.content === "string" && turn.content.trim() !== "",
  );
  const requests = usable
    .map((turn, index) => ({ turn, index }))
    .filter(
      ({ turn }) => turn.role === "user" && detectTemplateIntent(turn.content).kind !== "none" && !onlyHistory(turn.content, today),
    )
    .map(({ index }) => index);
  const start = !options.fromThisForm && requests.length >= 2 ? requests[requests.length - 2]! + 1 : 0;
  const said = usable
    .slice(start)
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content);
  const level = warningLevelFromTurns(said, today);
  if (level || !warningLevelAndClauseEnabled()) return level;
  /*
   * WARNING_LEVEL_AND_CLAUSE_ENABLED (QA B1 live, 27 Oct 2026): the card read
   * "this should be a written and note a verbal ca …" as Written, and this
   * check of the stated level — at Create and at drafting — did not, so the
   * saved draft had no Type of Warning. The same clause reading, latest turn
   * first, from the turn that opened the window: "this should be a written and
   * note a verbal ca …" names "ca", so it counts as a request itself.
   */
  const from = !options.fromThisForm && requests.length >= 2 ? requests[requests.length - 2]! : 0;
  const window = usable
    .slice(from)
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content);
  for (const turn of [...window].reverse()) {
    const clause = levelInOwnClause(turn, today);
    if (clause) return clause;
  }
  return null;
}
