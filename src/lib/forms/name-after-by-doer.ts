import { nameLastAfterByEnabled } from "@/lib/config/chat-quality-flags";

/*
 * NAME_LAST_AFTER_BY_ENABLED: the roster reader's half of `name-after-by.ts`, on its own so that `employee-match.ts`
 * can read it without importing `name-after-by.ts`, which imports `employee-match.ts` (the import-cycle test).
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
