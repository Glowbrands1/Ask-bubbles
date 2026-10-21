import {
  findManualSection,
  manualSheetHeadings,
  offenseKeyForManualHeading,
  type ManualChunk,
  type ManualSection,
} from "./official-policy-manual";

/**
 * ============================================================================
 * "VIOLATING VISITORS AT WORK POLICY" — A POLICY THE MANAGER NAMED, FOUND IN
 * THE MANUAL BY ITS OWN HEADING
 * ============================================================================
 *
 * District Manager feedback, 21 Oct 2026: "create verbal CA for <employee> for
 * violating visitors at work policy on 10-10-26 …" came back with no policy
 * named in the reply, no offense box, and no Direct policy line. The manual
 * has the section — "Visitors in the Workplace", printed page 30 — but only
 * the handful of policies `ca-policy.ts` knows by name (Standards of Conduct,
 * Attendance, Dress Code, …) were ever read out of a manager's words.
 *
 * So a policy the manager names is matched against THE PINNED MANUAL'S OWN
 * SHEET HEADINGS, as the manual prints them, not against a list kept here:
 *
 *   the manager's words and a heading are compared word by word, ignoring
 *   filler ("the", "in", "at", "policy"), a plural "s", and a word that is
 *   the start of the other ("work" / "workplace");
 *
 *   every word the manager used must be in the heading, and every word of the
 *   heading in what they said (a heading word like "usage" or "workplace" may
 *   be left off);
 *
 *   exactly one heading may match. None, or two, and nothing is cited: the
 *   manager completes the policy, as on any form whose offense the manual
 *   does not name. A citation of the wrong section of a real manual looks
 *   checked, and that is the failure this must never produce.
 *
 * Nothing here composes a citation. The heading and its page come from the
 * manual's rows through `findManualSection`, exactly as for a ticked box.
 * Pure.
 */

/** A phrase the manager used to name a policy, as they wrote it. */
export interface NamedPolicy {
  /** The words between the verb and "policy": "visitors at work". */
  readonly phrase: string;
  /** Where it was found, for "the latest named wins". */
  readonly index: number;
}

/**
 * "violating visitors at work policy", "violated the cell phone policy",
 * "breach of our visitor policy", "against the no visitors policy". The verb is
 * what makes the words a policy's name rather than a mention of one.
 */
const NAMED_POLICY =
  /\b(?:violat(?:ing|ed|es|e|ion\s+of)|broke|breaking|breach(?:ed|ing)?(?:\s+of)?|against|(?:did\s*n[o']?t|didn't|not|failed\s+to|refused\s+to)\s+follow(?:ing)?)\s+(?:the\s+|our\s+|a\s+|company'?s?\s+)?((?:[a-z][a-z'&/-]*\s+){1,5}?)polic(?:y|ies)\b/gi;

/**
 * "ca for pat rivera for cell phone/smart watch policy": no verb, the policy
 * named after "for". Read only where no verb above names one in the sentence.
 */
const FOR_POLICY =
  /\bfor\s+(?:the\s+|our\s+|a\s+|company'?s?\s+)?((?:[a-z][a-z'&/-]*\s+){1,5}?)polic(?:y|ies)\b/gi;

/**
 * A sentence that is only the policy's name — "Cell phone/smart watch
 * policy." — as HR writes it on a line of its own (HR feedback, 21 Oct 2026).
 */
const POLICY_LINE = /^\s*(?:the\s+|our\s+)?((?:[a-z][a-z'&/-]*\s+){1,5}?)polic(?:y|ies)\s*[.!]?\s*$/i;

/** Words a heading match ignores on either side. */
const FILLER = new Set([
  "the", "a", "an", "in", "at", "on", "of", "for", "to", "and", "with", "from", "our", "company", "companys",
  "company's", "policy", "policies", "rule", "rules", "section",
]);

/**
 * Heading words a manager may leave off: "cell phone" for "Cell Phone Usage",
 * "visitor policy" for "Visitors in the Workplace". Never the words that tell
 * one section from another.
 */
const OPTIONAL_HEADING_WORDS = new Set([
  "usage", "use", "procedure", "procedures", "guidelines", "requirements", "expectations", "workplace",
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^a-z0-9']+/)
    .map((word) => word.replace(/'s$/, "").replace(/'/g, ""))
    .filter((word) => word !== "" && !FILLER.has(word));
}

function stem(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

/** The same word, a plural of it, or one that starts the other ("work" / "workplace"). */
function sameWord(a: string, b: string): boolean {
  const x = stem(a);
  const y = stem(b);
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && long.startsWith(short);
}

/**
 * Whether the manager's words name this heading — or one side of a heading the
 * manual prints as two names joined by a slash. HR feedback, 21 Oct 2026:
 * "violated the cell phone policy" cited nothing, because the heading is
 * "Cell Phone/Smart Watch Policy" and "smart watch" was not said; "smoking
 * policy" is the manual's "Smoking/Vaping". Either side names the section, and
 * the uniqueness rule in `manualSectionNamedBy` still holds.
 */
export function namesHeading(phrase: string, heading: string): boolean {
  if (namesWholeHeading(phrase, heading)) return true;
  const slash = heading.indexOf("/");
  if (slash < 0) return false;
  return [heading.slice(0, slash), heading.slice(slash + 1)].some((side) => namesWholeHeading(phrase, side));
}

function namesWholeHeading(phrase: string, heading: string): boolean {
  const said = words(phrase);
  const printed = words(heading);
  if (said.length === 0 || printed.length === 0) return false;
  return (
    said.every((word) => printed.some((other) => sameWord(word, other))) &&
    printed.every(
      (word) => OPTIONAL_HEADING_WORDS.has(word) || said.some((other) => sameWord(word, other)),
    )
  );
}

/** Every policy the manager named, in the order they named them. Questions name none. */
export function namedPolicies(text: string): NamedPolicy[] {
  const found: NamedPolicy[] = [];
  for (const sentence of (text ?? "").matchAll(/[^.!?\n]+[.!?]*/g)) {
    if (/\?\s*$/.test(sentence[0])) continue;
    // A line that is only the name — not "violation of company policy", which names none.
    const line = /\b(?:violat|breach|broke|against|follow)/i.test(sentence[0]) ? null : POLICY_LINE.exec(sentence[0]);
    if (line && words(line[1]!).length > 0) found.push({ phrase: line[1]!.trim(), index: sentence.index });
    const verbs = [...sentence[0].matchAll(NAMED_POLICY)];
    for (const match of verbs.length > 0 ? verbs : sentence[0].matchAll(FOR_POLICY)) {
      // "ca for pat rivera for cell phone policy": the policy's name is what follows the last "for".
      const phrase = match[1]!.trim().split(/\bfor\s+/i).pop()!.trim();
      if (words(phrase).length === 0) continue;
      found.push({ phrase, index: sentence.index + match.index });
    }
  }
  return found;
}

export interface NamedManualSection {
  /** What the manager called it. */
  readonly phrase: string;
  /** The section, as the manual names and paginates it. */
  readonly section: ManualSection;
  /** The offense box that section is cited under: its own box where it has one, otherwise Violation of Company Policies. */
  readonly offenseKey: string;
  /** True when no policy was named and the account itself says the section's name ("on her cell phone"). */
  readonly mentioned?: boolean;
}

/**
 * The manual section the manager named, or null.
 *
 * THE LATEST NAMED POLICY THAT THE MANUAL ANSWERS, and only one that answers
 * unambiguously. A phrase no heading matches cites nothing. With no policy
 * named at all, the section whose name the account says — see
 * `mentionedManualSection`.
 */
export function namedManualSection(input: {
  readonly text: string;
  readonly chunks: readonly ManualChunk[] | null;
}): NamedManualSection | null {
  if (!input.chunks || input.chunks.length === 0) return null;
  const named = namedPolicies(input.text);
  for (const policy of [...named].reverse()) {
    const section = manualSectionNamedBy(policy.phrase, input.chunks);
    if (!section) continue;
    return { phrase: policy.phrase, section, offenseKey: offenseKeyForManualHeading(section.heading) };
  }
  return named.length === 0 ? mentionedManualSection(input.text, input.chunks) : null;
}

/**
 * ============================================================================
 * "TALKING ON HER CELL PHONE FOR OVER 30 MINUTES" — THE SECTION THE ACCOUNT
 * NAMES WITHOUT CALLING IT A POLICY
 * ============================================================================
 *
 * HR feedback, 21 Oct 2026: that account named no policy, the model filed it
 * under the Standards of Conduct, and HR had to point at the manual's Cell
 * Phone/Smart Watch Policy on page 19. Where no policy is named, a section is
 * cited only when the account says its whole name, word for word — "cell
 * phone", "smart watch", "social media" — only for a section the manual
 * itself titles a Policy, and only a name of two words or more. Checked
 * against all of the real manual's headings: without the Policy rule,
 * "payroll deduct applies" cited Payroll Deductions on every form that
 * answered the payroll question, and "time records", "shift replacement" read
 * the same way; a one-word name ("Shoes", "Smoking") is too common a word.
 * Exactly one section may answer, as for a named one; a question names
 * nothing. The proposal says the policy was read from the account, so the
 * manager can change it.
 */
export function mentionedManualSection(text: string, chunks: readonly ManualChunk[]): NamedManualSection | null {
  const sentences = [...(text ?? "").matchAll(/[^.!?\n]+[.!?]*/g)]
    .map((match) => match[0])
    .filter((sentence) => !/\?\s*$/.test(sentence))
    .map((sentence) => words(sentence));
  const says = (name: readonly string[]) =>
    sentences.some((said) =>
      said.some((_, start) => name.every((word, offset) => said[start + offset] !== undefined && sameWord(said[start + offset]!, word))),
    );
  const matches = manualSheetHeadings(chunks).filter((heading) => {
    if (!/\bpolic(?:y|ies)\b/i.test(heading)) return false;
    const slash = heading.indexOf("/");
    const names = slash < 0 ? [heading] : [heading, heading.slice(0, slash), heading.slice(slash + 1)];
    return names.map((name) => words(name)).some((name) => name.length >= 2 && says(name));
  });
  const unique = [...new Set(matches)];
  if (unique.length !== 1) return null;
  const section = findManualSection(chunks, unique);
  if (!section) return null;
  return { phrase: unique[0]!, section, offenseKey: offenseKeyForManualHeading(section.heading), mentioned: true };
}

/**
 * The one section of the manual these words name, by the reading above —
 * every word said in the heading, every heading word said — or null when no
 * heading, or more than one, answers. Also how a policy named for a form that
 * is already open is found (`policy-change.ts`), so a name that cites a
 * section on a new Corrective Action cites the same section on an open one.
 */
export function manualSectionNamedBy(phrase: string, chunks: readonly ManualChunk[] | null): ManualSection | null {
  if (!chunks || chunks.length === 0 || words(phrase).length === 0) return null;
  const matches = [...new Set(manualSheetHeadings(chunks).filter((heading) => namesHeading(phrase, heading)))];
  if (matches.length !== 1) return null;
  return findManualSection(chunks, matches);
}
