import { detectTemplateIntent } from "./template-intent";
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
    .filter(({ turn }) => turn.role === "user" && detectTemplateIntent(turn.content).kind !== "none")
    .map(({ index }) => index);
  const start = !options.fromThisForm && requests.length >= 2 ? requests[requests.length - 2]! + 1 : 0;
  return warningLevelFromTurns(
    usable
      .slice(start)
      .filter((turn) => turn.role === "user")
      .map((turn) => turn.content),
    today,
  );
}
