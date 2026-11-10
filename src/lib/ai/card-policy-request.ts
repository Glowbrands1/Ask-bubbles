import { cardPolicyMadeAboutEnabled } from "@/lib/config/chat-quality-flags";
import { startsFormRequest } from "@/lib/forms/current-request";

import { withoutAppLines } from "./app-sentences";
import { turnsMadeAbout } from "./make-it-about";

/**
 * ============================================================================
 * A CARD'S POLICY IS READ FROM ITS OWN REQUEST (CARD_POLICY_OWN_REQUEST_ENABLED)
 * ============================================================================
 *
 * QA's live tester (flip 7, 7 Nov 2026): "Coaching form for <A> for being on her phone …", then "Coaching form for
 * <B>". B's card had the right person, but cited Cell Phone/Smart Watch p.19 (the sibling app's live tester). Here the same
 * reading is latent: with POLICY_CITATION_ENABLED on, the form answer's mapped policy (`server-ask.ts`
 * decorateFormAnswer, withMappedPolicy) is read over every manager turn of the chat, so B's card cites A's policy.
 *
 * The turns are cut at the latest form request that names the card's employee, and only when no earlier turn names
 * them: a request for another person. A form switch with no name ("make it a coaching form instead") and a second
 * request for the same person (SECOND_REQUEST_OWN_ACCOUNT's case) keep every turn, as before.
 */

function nameWords(employeeName: string): RegExp | null {
  const words = employeeName
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}'’-]/gu, ""))
    .filter((word) => word.length >= 2)
    // Only the pattern's own characters are escaped: "\'" and "\-" are invalid escapes under the "u" flag, so an
    // apostrophe or hyphen name ("O'Dallagher") threw, and the policy step was skipped (the sibling app's round-4 gate).
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return words.length > 0 ? new RegExp(String.raw`(?<![\p{L}])(?:${words.join("|")})(?![\p{L}])`, "iu") : null;
}

/** The manager turns the card's policy is read from: its own request's, or all of them. */
/*
 * CARD_POLICY_MADE_ABOUT_ENABLED (the off-flag audit, QA, 10 Nov 2026): with POLICY_CITATION on, "create a coaching form
 * for <A>, she missed the monthly meeting on 10/10/26" then "make it about leaving the front desk unattended on 11/6/26"
 * cited the meeting's Attendance Policy (p.14) on the card, not the Standards of Conduct (p.13) the new account is
 * about. With the flag on, the card's policy is read from the turns as "make it about" leaves them (`turnsMadeAbout`):
 * the account before it is set aside. Off, as before.
 */
export function cardPolicyTurns(turns: readonly string[], employeeName: string | null): readonly string[] {
  const own = ownRequestTurns(turns, employeeName);
  return cardPolicyMadeAboutEnabled() ? turnsMadeAbout(own) : own;
}

function ownRequestTurns(turns: readonly string[], employeeName: string | null): readonly string[] {
  const named = employeeName ? nameWords(employeeName) : null;
  if (!named) return turns;
  /*
   * The manager's own words decide, never the slot lines the app puts ahead of a turn ("The form is the Coaching
   * Form. The employee is <B>. …", `app-sentences.ts`): in the sibling app a name-only answer to "who is this for?"
   * read as a new request for <B> with them, and lost the policy the turn before it asked for (its round-4 gate).
   */
  const said = turns.map((turn) => withoutAppLines(turn));
  for (let index = said.length - 1; index > 0; index -= 1) {
    const turn = said[index] ?? "";
    if (!startsFormRequest(turn) || !named.test(turn)) continue;
    return said.slice(0, index).some((earlier) => named.test(earlier)) ? turns : turns.slice(index);
  }
  return turns;
}
