import { asksForSameForm } from "./same-form-copy";
import { displayName, rosterNameNamedIn, type RosterEmployee } from "./employee-match";

/**
 * ============================================================================
 * "COPY THIS FORM FOR <B>" WITH <A>'S FORM OPEN IS <B>'S NEW FORM
 * (COPY_OPEN_FORM_FOR_PERSON_ENABLED, default off; QA, 8 Nov 2026)
 * ============================================================================
 *
 * With <A>'s Coaching Form open, "copy this form for <B>" made no card at all: the reply was the answering model's
 * ("A grounded answer from the policy manual."), and the card on screen stayed A's. The same turn with nothing open
 * made B's card, and so did "create the same coaching form for <B>" with A's form open: the open draft took the
 * turn only because "this form" reads as carrying the open intake on.
 *
 * With the flag on, a same-form copy request (`asksForSameForm`, the words the copy at Create already reads) that
 * names exactly one roster person other than the open form's employee is read as the request for that person's form
 * of the open form's template: the open draft is set aside for the turn, as NEW_REQUEST_OPEN_DRAFT sets it aside,
 * and the turn is read as "create the same <template> for <B>". The manager's own words stay in the history, so
 * Create copies A's form as it does for any same-form request. A's form is not touched. Off, null.
 */
export function copyOpenFormFor(input: {
  readonly question: string;
  readonly openTemplateName: string | null | undefined;
  readonly openEmployeeName: string | null | undefined;
  readonly roster: readonly RosterEmployee[];
}): string | null {
  const template = (input.openTemplateName ?? "").trim();
  const open = (input.openEmployeeName ?? "").trim().toLowerCase();
  if (!template || !open || !asksForSameForm(input.question)) return null;
  const others = input.roster.filter(
    (person) => displayName(person).toLowerCase() !== open && rosterNameNamedIn(input.question, [person]) !== null,
  );
  if (others.length !== 1) return null;
  return `create the same ${template.toLowerCase()} for ${displayName(others[0]!)}`;
}
