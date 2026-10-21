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
 * Whether the manager's words name this heading.
 *
 * A HEADING WITH A SLASH NAMES ONE SECTION TWO WAYS. "Cell Phone/Smart Watch
 * Policy" is the cell phone policy and the smart watch policy (District
 * Manager feedback, 21 Oct 2026: "cell phone" never matched it, because "smart"
 * and "watch" were not said). Every word said must still be in the heading;
 * the words of ONE side of the slash are what must all be said.
 */
export function namesHeading(phrase: string, heading: string): boolean {
  const said = words(phrase);
  const printed = words(heading);
  if (said.length === 0 || printed.length === 0) return false;
  if (!said.every((word) => printed.some((other) => sameWord(word, other)))) return false;
  return heading
    .split("/")
    .map(words)
    .filter((side) => side.length > 0)
    .some((side) =>
      side.every((word) => OPTIONAL_HEADING_WORDS.has(word) || said.some((other) => sameWord(word, other))),
    );
}

/** Every policy the manager named, in the order they named them. Questions name none. */
export function namedPolicies(text: string): NamedPolicy[] {
  const found: NamedPolicy[] = [];
  for (const sentence of (text ?? "").matchAll(/[^.!?\n]+[.!?]*/g)) {
    if (/\?\s*$/.test(sentence[0])) continue;
    for (const match of sentence[0].matchAll(NAMED_POLICY)) {
      const phrase = match[1]!.trim();
      if (words(phrase).length === 0) continue;
      found.push({ phrase, index: sentence.index + match.index });
    }
  }
  return found;
}

/*
 * ============================================================================
 * "TALKING ON HER CELL PHONE" — A POLICY THE ACCOUNT DESCRIBES
 * ============================================================================
 *
 * District Manager feedback, 21 Oct 2026: "on 10-20-26 <employee> was talking
 * on her cell phone for over 30 minutes" was cited Standards of Conduct; the
 * manual has a section for exactly that, "Cell Phone/Smart Watch Policy",
 * page 19. The manager named no policy, so `namedPolicies` read none.
 *
 * An account of the employee's OWN phone or smart watch is read as the words
 * a manager would name that policy by, and those words go through the same
 * heading match as a named policy: the manual still decides which section, if
 * any, they are. Only the employee's own device in use — "on her phone",
 * "cell phone use", "texting" — never a phone the store or a guest used, and
 * never "I called her phone", which is how a no-show is described.
 */
const DESCRIBED_POLICIES: readonly { readonly describes: RegExp; readonly phrase: string }[] = [
  {
    phrase: "cell phone",
    describes:
      /\b(?:on|using|use|used|uses|playing\s+(?:on|with)|scrolling\s+(?:on|through)|texting\s+on|looking\s+at|checking|had|has|pulled\s+out)\s+(?:(?:her|his|their|a|the|personal|own)\s+){0,2}(?:cell\s*phones?|cellphones?|smart\s*phones?)\b|\b(?:on|using|use|used|uses|playing\s+(?:on|with)|scrolling\s+(?:on|through)|texting\s+on|looking\s+at|checking|had|has|pulled\s+out)\s+(?:her|his|their)\s+(?:own\s+|personal\s+)?phones?\b|\b(?:cell\s*phone|cellphone|personal\s+phone|phone)\s+(?:use|usage)\b|\btexting\b/i,
  },
  { phrase: "smart watch", describes: /\bsmart\s*watch(?:es)?\b/i },
];

/** The policies the manager's account describes without naming, as the words that would name them. */
export function describedPolicies(text: string): NamedPolicy[] {
  const found: NamedPolicy[] = [];
  for (const sentence of (text ?? "").matchAll(/[^.!?\n]+[.!?]*/g)) {
    if (/\?\s*$/.test(sentence[0])) continue;
    for (const { describes, phrase } of DESCRIBED_POLICIES) {
      const match = describes.exec(sentence[0]);
      if (match) found.push({ phrase, index: sentence.index + match.index });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

export interface NamedManualSection {
  /** What the manager called it. */
  readonly phrase: string;
  /** True when the account described the policy rather than naming it. */
  readonly described: boolean;
  /** The section, as the manual names and paginates it. */
  readonly section: ManualSection;
  /** The offense box that section is cited under: its own box where it has one, otherwise Violation of Company Policies. */
  readonly offenseKey: string;
}

/**
 * The manual section the manager named, or null.
 *
 * THE LATEST NAMED POLICY THAT THE MANUAL ANSWERS, and only one that answers
 * unambiguously. A phrase no heading matches cites nothing. Only when no named
 * policy answers, the latest policy the account describes.
 */
export function namedManualSection(input: {
  readonly text: string;
  readonly chunks: readonly ManualChunk[] | null;
}): NamedManualSection | null {
  if (!input.chunks || input.chunks.length === 0) return null;
  const candidates = [
    ...[...namedPolicies(input.text)].reverse().map((named) => ({ named, described: false })),
    ...[...describedPolicies(input.text)].reverse().map((named) => ({ named, described: true })),
  ];
  for (const { named, described } of candidates) {
    const section = manualSectionNamedBy(named.phrase, input.chunks);
    if (!section) continue;
    return { phrase: named.phrase, described, section, offenseKey: offenseKeyForManualHeading(section.heading) };
  }
  return null;
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
