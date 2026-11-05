import { describesIncident } from "./corrective-action-intake";

/**
 * CA_CARD_ADDED_DETAIL_ENABLED (Pau via QA, 5 Nov 2026, sf-b6): the manager's
 * turns after the one the card's Issue came from that add to the account
 * ("can you have it include that we recieved a customer complaint …"). The
 * card read the Issue from the request alone, so the next card dropped what
 * the manager added. Each turn is kept in their own words; a turn that only
 * asks for the form is no account and is left out.
 */
export function addedDetailTurns(turns: readonly string[], issue: string | null): string[] {
  if (!issue) return [];
  const from = turns.findIndex((turn) => turn.toLowerCase().includes(issue.toLowerCase()));
  if (from < 0) return [];
  return turns
    .slice(from + 1)
    .map((turn) => turn.trim())
    .filter((turn) => turn !== "" && describesIncident(turn));
}
