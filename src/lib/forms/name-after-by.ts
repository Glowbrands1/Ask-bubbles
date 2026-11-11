import { nameLastAfterByEnabled } from "@/lib/config/chat-quality-flags";

import { matchEmployeeName, type RosterEmployee } from "./employee-match";

/*
 * ============================================================================
 * "… TREATED RUDELY … BY <NAME>": THE DOER, NOT A WITNESS (NAME_LAST_AFTER_BY_ENABLED; QA's name matrix, 4 Nov 2026)
 * ============================================================================
 *
 * QA's exact wordings "corrective action: a guest was treated rudely at the front desk on monday by corin bellweather"
 * (lower case) and the same in capitals made no card for the roster's Corin Bellweather. Lower case: the roster
 * reader (`rosterNameNamedIn`) skips a name after "by" as a reporter or witness ("reported by …"). Capitals: the name
 * reader took "BY CORIN BELLWEATHER" as the name. With the flag on, a full roster name after "by" at the end of the
 * sentence, after a passive clause ("was treated … by", "were left … by"), is the person who did it, unless the "by"
 * follows a reporting word ("reported by", "signed by", "seen by"); and a card name "BY <roster name>" is that roster
 * person. Off, as before. Invented people.
 */

/** The words before "by" that make the name a reporter, signer or witness. */
const REPORTED_BY = /\b(?:reported|written|signed|submitted|approved|observed|witnessed|seen|noticed|heard|told|sent|called|emailed|texted|hired|trained|coached|supervised|managed|scheduled|covered|replaced|relieved|helped|assisted|referred|brought)\s+by\s*$/;
/** A passive clause before "by": "was treated rudely at the front desk on monday by". */
const PASSIVE = /\b(?:was|were|been|being|got|gets|is|are)\s+(?:not\s+)?[a-z]+(?:ed|en|t)\b[^.!?\n]*\bby\s*$/;

/**
 * Whether the name at this place in the normalised text (" <first> <last> ", with "before" the words in front of it
 * and "after" the words behind it) is the doer named after "by" at the end of a passive sentence.
 */
export function doerAfterBy(before: string, after: string): boolean {
  if (!nameLastAfterByEnabled()) return false;
  if (!/\bby\s*$/.test(before) || REPORTED_BY.test(before)) return false;
  if (!PASSIVE.test(before)) return false;
  // The end of the sentence: nothing but space after the name in the normalised text (punctuation is already gone).
  return after.trim() === "";
}

interface CardLike {
  employeeName: string | null;
}

/** A card name "BY <roster name>" ("BY CORIN BELLWEATHER") is that roster person, and the reply names them so. */
export function withNameAfterBy<T extends { content: string; formProposal?: CardLike | null }>(answer: T, roster: readonly RosterEmployee[]): T {
  if (!nameLastAfterByEnabled()) return answer;
  const typed = answer.formProposal?.employeeName?.trim();
  const rest = typed ? /^by\s+(.+)$/i.exec(typed)?.[1] : undefined;
  if (!typed || !rest) return answer;
  const match = matchEmployeeName(rest, roster);
  if (match.kind !== "exact") return answer;
  return {
    ...answer,
    content: answer.content.split(`**${typed}**`).join(`**${match.name}**`),
    formProposal: { ...answer.formProposal!, employeeName: match.name },
  };
}
