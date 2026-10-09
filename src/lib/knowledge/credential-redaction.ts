import type { MatchedChunkRow } from "./mappers";

/**
 * ============================================================================
 * DEFAULT PASSWORDS STAY IN THE DOCUMENT UNLESS THE QUESTION IS ABOUT THEM
 * ============================================================================
 *
 * Ported from the reference platform's fix for its 7 Oct 2026 feedback, where
 * "how can I change my password" was answered with new-hire default passwords
 * for two company systems, copied out of an approved manager manual. The
 * section is legitimate and a manager needs it when onboarding — but a person
 * asking about their OWN password did not ask for anyone's default
 * credentials, and an answer is easy to forward.
 *
 * Ask Bubbles has no such section in its knowledge base today (checked 8 Oct
 * 2026); this keeps it that way for every document uploaded later.
 *
 * So the value after "default password is" — and the same with temporary,
 * initial, generic or shared — is withheld from the model's grounding AND
 * from the source-card excerpt, unless the question is about setting up a new
 * hire's accounts or names the default password itself. The rest of the
 * section, and where to find it, still reach the answer.
 *
 * WHAT THIS DOES NOT TOUCH: equipment codes ("factory set password is 0000").
 * Those unlock a timer or a thermostat, are printed in the manufacturer's own
 * manual, and are what a technician question needs. Nothing in the knowledge
 * base is changed; this is applied per answer.
 */

/*
 * THE TRIGGER, then EVERYTHING TO THE END OF THE SENTENCE — across a wrapped
 * line, but not into the next list item or paragraph. A value can carry a
 * colon, spaces or a rule ("plus the last four digits of …"), and the system
 * can be named between the words ("the default password for the scheduling
 * app is …"), so matching one token after "is" would leak whatever followed
 * it. The rest of the sentence is withheld instead; the sentences around it
 * are kept.
 */
const DEFAULT_PASSWORD =
  /\b((?:default|temporary|initial|generic|shared)\s+(?:passwords?|pass\s?codes?|pins?)\b(?:\s+(?:for|in|on|to|of)\s+[^.\n:=]{1,40}?)?\s*(?:(?:is|are|will\s+be|=)\s*:?|[:=]))[ \t]*((?:[^.\n]|\.(?!\s|$)|\n(?!\s*(?:\d+[.)]|[•*-])\s|\s*\n))*?)(?=\.(?:\s|$)|\n\s*(?:\d+[.)]|[•*-])\s|\n\s*\n|$)/gi;

/** Names no document section: Ask Bubbles' sources are its own company's. */
export const WITHHELD_PASSWORD = "[withheld — see the account set-up steps in the source document]";

/**
 * Whether the question is about setting up a new hire's accounts, or names a
 * default password itself. Being a new hire is not enough on its own — "I'm a
 * new hire, how do I change my password?" asks about one's own password — so
 * a new hire must come with setting up or onboarding.
 */
export function asksForDefaultCredentials(question: string): boolean {
  if (/\b(?:default|initial|temporary)\s+(?:passwords?|logins?|pins?)\b/i.test(question)) return true;
  const newHire = /\b(?:new[\s-]*hires?|new\s+employees?|onboard\w*)\b/i.test(question);
  const setUp = /\b(?:set\s*up|setting\s+up|setup|onboard\w*|first\s+log\s?in|create\s+(?:their|a)\s+password)\b/i.test(question);
  return newHire && setUp;
}

export function redactDefaultPasswords(text: string): string {
  return text.replace(DEFAULT_PASSWORD, (_match, lead: string) => `${lead.trimEnd()} ${WITHHELD_PASSWORD}`);
}

/** The rows as they may be shown for this question. */
export function rowsForQuestion(question: string, rows: readonly MatchedChunkRow[]): MatchedChunkRow[] {
  if (asksForDefaultCredentials(question)) return [...rows];
  return rows.map((row) => {
    const content = redactDefaultPasswords(row.content);
    return content === row.content ? row : { ...row, content };
  });
}
