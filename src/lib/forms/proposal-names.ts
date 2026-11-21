import { JOB_TITLES } from "./proposal";

/**
 * ============================================================================
 * TWO NAME HELPERS THE AGENT LOOP READS, BESIDE `proposal.ts`
 * ============================================================================
 *
 * Ported from the sibling app, where they are exported from `forms/proposal.ts`.
 * Here `proposal.ts` is on the protected list (`ai/flags-off-parity.test.ts`),
 * so the two live in this module and no existing path calls them.
 *
 * `isJobTitlePhrase` is this app's own private reading in `proposal.ts`, kept
 * the same: `proposal-names.test.ts` checks the two word lists below still
 * match the ones there, so they cannot drift apart.
 */

/*
 * "DISTRICT MANAGER" IS A JOB, NOT A SECOND EMPLOYEE. A capitalised pair that
 * is wholly a job title (one the business uses, or a title word such as Manager
 * or Director led only by words like Store, District or Assistant) is never a
 * person.
 */
const TITLE_HEAD = /^(?:managers?|directors?|consultants?|supervisors?|leads?|trainers?|coordinators?|specialists?)$/i;
const TITLE_MODIFIER =
  /^(?:salon|location|district|regional|area|store|makery|general|assistant|shift|training|operations|spa|senior|junior|head|key)$/i;

export function isJobTitlePhrase(candidate: string): boolean {
  if (JOB_TITLES.some((entry) => entry.pattern.test(candidate) && candidate.replace(entry.pattern, "").trim() === "")) {
    return true;
  }
  const words = candidate.trim().split(/\s+/);
  return (
    words.length >= 2 &&
    TITLE_HEAD.test(words[words.length - 1]!) &&
    words.slice(0, -1).every((word) => TITLE_MODIFIER.test(word))
  );
}

/*
 * THE NAME IS PRINTED AS THE MANAGER TYPED IT (QA, 22 Oct 2026): the manager's
 * own spelling is kept — capitalising guesses at "JD SMITH", "John Smith III",
 * "mcdonald" and "de la cruz" — unless the employee directory has an EXACT
 * match. Only spacing is tidied; the field stays editable on the form.
 */
export function tidyTypedName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
