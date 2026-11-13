import type { RosterEmployee } from "./employee-match";

/**
 * ============================================================================
 * TWO PEOPLE WITH ONE NAME: A NUMBERED CHOICE, ANSWERED BY IDENTITY
 * (SAME_NAME_ASKS_WHICH_ENABLED, default off; QA, 12 Nov 2026)
 * ============================================================================
 *
 * Two active people with one name at ONE store were asked "Which store is the
 * one you mean?", which cannot tell them apart. The choice is numbered and
 * labelled with each person's store and job title, and the manager's answer —
 * the number, the job title, or the store — is matched to a candidate by its
 * store AND title, never by its name (the names are the same). The history is
 * the browser's: an answer only ever selects one of the roster candidates the
 * caller passes in. Pure.
 */

export interface SameNameCandidate {
  readonly employee: RosterEmployee;
  readonly name: string;
}

interface Option {
  readonly number: number;
  readonly name: string;
  readonly detail: string;
}

// A store label may hold parentheses ("Omaha, NE (West Dodge Rd) (Store 264)"): a label runs to the next option or the "?".
const OPTION = /(\d+)\. \*\*([^*]+)\*\* \((.+?)\)(?= or \d+\. \*\*|\?)/g;
const TYPED = /a close match for \*\*([^*]+)\*\*/;

function detailOf(candidate: SameNameCandidate, storeLabel: (id: string) => string): string {
  const stores = candidate.employee.locationIds.map(storeLabel).join(" and ");
  return [stores, candidate.employee.positionName?.trim() || null].filter(Boolean).join(", ");
}

/** "Did you mean 1. **<name>** (<store>, <title>) or 2. …?" — the question asked instead of "Which store?". */
export function sameNameQuestion(
  typed: string,
  candidates: readonly SameNameCandidate[],
  storeLabel: (id: string) => string,
): string {
  const options = candidates.map((candidate, index) => `${index + 1}. **${candidate.name}** (${detailOf(candidate, storeLabel)})`);
  return `Did you mean ${options.join(" or ")}? More than one person on your team is a close match for **${typed}**. Reply with the number, the store, or the job title — or say "keep ${typed}" to use the name exactly as you typed it.`;
}

function optionsIn(content: string): Option[] {
  if (!content.trim().startsWith("Did you mean ") || !TYPED.test(content)) return [];
  return [...content.matchAll(OPTION)].map((match) => ({ number: Number(match[1]), name: match[2]!.trim(), detail: match[3]!.trim() }));
}

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3);

function optionForReply(reply: string, options: readonly Option[]): Option | null {
  const text = reply.trim().toLowerCase().replace(/[.!]+$/, "");
  const numbered = /^(?:#|no\.?\s*|number\s+|option\s+)?(\d+)$/.exec(text)?.[1] ??
    (/\b(?:first|1st)\b/.test(text) ? "1" : /\b(?:second|2nd)\b/.test(text) ? "2" : /\b(?:third|3rd)\b/.test(text) ? "3" : null);
  if (numbered) return options.find((option) => option.number === Number(numbered)) ?? null;
  const said = new Set(words(text));
  // The option whose label has a word no other option's label has, and the reply says it (a title, or a store).
  const hits = options.filter((option) =>
    words(option.detail).some((word) => said.has(word) && !options.some((other) => other !== option && words(other.detail).includes(word))),
  );
  return hits.length === 1 ? hits[0]! : null;
}

/**
 * The candidate the manager chose in answer to `sameNameQuestion`, by identity, or "keep" when they said to keep the
 * typed name, or null. The latest answer wins; only a turn right after the question answers it.
 */
export function sameNameChoice(
  conversation: readonly { role: string; content: string }[],
  candidates: readonly SameNameCandidate[],
  storeLabel: (id: string) => string,
): SameNameCandidate | "keep" | null {
  for (let index = conversation.length - 1; index > 0; index -= 1) {
    const turn = conversation[index]!;
    if (turn.role !== "user") continue;
    const asked = conversation[index - 1]!;
    if (asked.role !== "assistant") continue;
    const options = optionsIn(asked.content);
    if (options.length < 2) continue;
    // The turn may carry the saved form state before or after the manager's words ("…\nWarning level: verbal."):
    // the first line that answers the choice is the answer.
    const lines = turn.content.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.some((line) => /^keep\b/i.test(line))) return "keep";
    const option = lines.map((line) => optionForReply(line, options)).find((found) => found !== null) ?? null;
    if (!option) return null;
    const fits = candidates.filter(
      (candidate) => candidate.name.toLowerCase() === option.name.toLowerCase() && detailOf(candidate, storeLabel) === option.detail,
    );
    return fits.length === 1 ? fits[0]! : null;
  }
  return null;
}
