import {
  matchEmployeeName,
  type RosterEmployee,
} from "@/lib/forms/employee-match";

import { groundEmployee } from "./roster-grounding";

/**
 * A candidate is an employee only when the roster says so.
 *
 * A document or policy name is the policy source: every word of the span, or
 * of a multi-word window of it, is a word of a retrieved heading or of the
 * manual's own title. That span is not a person. A fragment with no roster
 * match is not a person either. A full name the roster does not know stays
 * only when it is the only name in the turn, so a new hire is not blocked and
 * a confused list is not offered as a choice.
 */

export type GroundedNameResolution =
  | { kind: "resolved"; name: string }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "missing" }
  | { kind: "unchanged" };

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2);
}

function letters(token: string): string {
  return token.replace(/[^A-Za-z]/g, "");
}

/** One or two letters, or a single very short token. Not a full name. */
export function isNameFragment(span: string): boolean {
  const tokens = span.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  if (tokens.length === 1) return letters(tokens[0]!).length <= 3;
  return tokens.every((token) => letters(token).length <= 2);
}

/**
 * The span names a retrieved heading or the manual's title.
 *
 * "JBA Manual" names "JBA Policy Manual" because both of its words are words
 * of that title. The comparison is against the titles passed in, which are
 * the pinned manual and its sections.
 */
export function isPolicySourceSpan(span: string, sources: readonly string[]): boolean {
  const words = wordsOf(span);
  if (words.length < 2) return false;
  const windows: string[][] = [words];
  for (let size = 2; size < words.length; size += 1) {
    for (let index = 0; index + size <= words.length; index += 1) windows.push(words.slice(index, index + size));
  }
  for (const source of sources) {
    const title = new Set(wordsOf(source));
    if (title.size < 2) continue;
    for (const window of windows) {
      if (window.length < 2) continue;
      if (window.every((word) => title.has(word)) && new Set(window).size >= 2) return true;
    }
  }
  return false;
}

function rosterName(span: string, roster: readonly RosterEmployee[]): string | null {
  if (roster.length === 0 || isNameFragment(span)) return null;
  const match = matchEmployeeName(span, roster);
  const tokens = span.trim().split(/\s+/).filter(Boolean);
  if (match.kind === "exact") return match.name;
  if (match.kind === "confirm" && match.candidates.length === 1 && tokens.length >= 2) {
    return match.candidates[0]!.name;
  }
  if (
    match.kind === "confirm" &&
    match.candidates.length === 1 &&
    tokens.length === 1 &&
    letters(tokens[0]!).length >= 4
  ) {
    return match.candidates[0]!.name;
  }
  return null;
}

export function filterEmployeeCandidates(input: {
  readonly candidates: readonly string[];
  readonly roster: readonly RosterEmployee[];
  readonly headings: readonly string[];
}): string[] {
  const unique = [...new Set(input.candidates.map((candidate) => candidate.trim()).filter(Boolean))];
  const judged = unique.map((candidate) => ({
    candidate,
    person: rosterName(candidate, input.roster),
    policySource: isPolicySourceSpan(candidate, input.headings),
    fragment: isNameFragment(candidate),
  }));
  const people = [...new Set(judged.flatMap((row) => (row.person ? [row.person] : [])))];
  if (people.length > 0) return people;
  const confused = judged.some((row) => row.policySource || row.fragment);
  const fullNames = judged.filter((row) => !row.policySource && !row.fragment && wordsOf(row.candidate).length >= 2);
  if (!confused && fullNames.length === 1) return [fullNames[0]!.candidate];
  return [];
}

export function groundEmployeeResolution(input: {
  readonly candidates: readonly string[];
  readonly text: string;
  readonly roster: readonly RosterEmployee[];
  readonly headings: readonly string[];
}): GroundedNameResolution {
  const pool = [...input.candidates];
  const seen = groundEmployee(input.text, input.roster);
  if (seen && !seen.needsChoice && seen.name) pool.push(seen.name);
  if (seen?.needsChoice) {
    for (const candidate of seen.candidates) pool.push(candidate.name);
  }
  if (pool.length === 0) return { kind: "unchanged" };
  const kept = filterEmployeeCandidates({ candidates: pool, roster: input.roster, headings: input.headings });
  if (kept.length === 1) return { kind: "resolved", name: kept[0]! };
  if (kept.length > 1) return { kind: "ambiguous", candidates: kept };
  return { kind: "missing" };
}
