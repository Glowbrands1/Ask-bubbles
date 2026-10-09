import { JOIN } from "./bounded-context";

/**
 * ============================================================================
 * "A WRITTEN WARNING FOR CASH HANDLING" — WHAT THE FORM IS FOR
 * ============================================================================
 *
 * The issue a Corrective Action is about, in the manager's own words, read
 * from the request that asked for it: "needs a written warning for cash
 * handling" → "cash handling". Read back on the card beside the employee, so
 * the two can never be confused again — signed-in QA, 8 Oct 2026, found the
 * issue printed as the employee's NAME.
 *
 * Only what follows "for / about / over / regarding" after the warning or the
 * form itself, cut at the next clause; never a person (`employeeName`), and
 * never a guess. Null when the manager did not state one that way — the card
 * then says nothing about it and the draft is written from their account.
 *
 * Pure and browser-safe.
 */

const REQUEST =
  /\b(?:warning|write[- ]?up|corrective\s+action(?:\s+form)?|ca|c\/a|dpoa)\s+(?:for|about|over|regarding|re:?)\s+([^.;!?\n]+)/gi;
const CUT = /\s*(?:,|\s-\s|\s—\s|\band\b(?=\s+(?:a|an|the|also|then|she|he|they|i|we|please|pls)\b)|\bplease\b|\bpls\b|\bthanks?\b|\bthank you\b)/i;
const NOT_AN_ISSUE = /^(?:her|him|them|this|that|it|the\s+employee|my\s+employee|an?\s+employee|today|tomorrow|yesterday)$/i;

export function correctiveActionIssue(text: string, employeeName: string | null): string | null {
  const turns = (text ?? "")
    .split(JOIN)
    .map((turn) => turn.trim())
    .filter(Boolean);
  const person = (employeeName ?? "").trim().toLowerCase();
  const personWords = new Set(person.split(/\s+/).filter(Boolean));
  for (const turn of [...turns].reverse()) {
    let found: string | null = null;
    for (const match of turn.matchAll(REQUEST)) {
      let issue = match[1]!.split(CUT)[0]!.trim().replace(/[\s"'”’)]+$/, "");
      // "a CA for Jordan Testperson for cash handling": the person, then the issue.
      if (person) {
        const words = [...personWords].map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
        const after = new RegExp(`^(?:(?:${words})\\s+)+(?:for|about|over|regarding)\\s+(.+)$`, "i").exec(issue);
        if (after) issue = after[1]!.trim();
      }
      const lower = issue.toLowerCase();
      if (issue.length < 3 || issue.length > 80 || NOT_AN_ISSUE.test(issue)) continue;
      // "a CA for Jordan Testperson" names the person, not the issue.
      if (person && (lower === person || lower.startsWith(`${person} `) || lower.split(/\s+/).every((word) => personWords.has(word)))) continue;
      found = issue;
    }
    if (found) return found;
  }
  return null;
}
