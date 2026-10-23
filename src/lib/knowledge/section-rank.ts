/**
 * How closely a manager's words name a manual heading.
 *
 * The score is token overlap against the headings that were actually
 * retrieved. A word that shows up on most of those headings is dropped for
 * that comparison, because it does not tell the sections apart. There is no
 * list of topics and no list of words to ignore up front: distinctiveness
 * comes from the headings in hand.
 *
 * A heading wins only when it matches and it leads the next heading by a
 * margin. A tie cites nothing.
 */

export function stemToken(word: string): string {
  const lower = word.toLowerCase();
  if (lower.length > 5 && lower.endsWith("ing")) return lower.slice(0, -3);
  if (lower.length > 4 && lower.endsWith("ed")) return lower.slice(0, -2);
  if (lower.length > 4 && lower.endsWith("es")) return lower.slice(0, -2);
  if (lower.length > 3 && lower.endsWith("s") && !lower.endsWith("ss")) return lower.slice(0, -1);
  return lower;
}

/** Words long enough to be a heading term. Shorter words are left out by length, not by a list. */
export function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4);
}

export function headingTokens(heading: string): string[] {
  return [...new Set(contentTokens(heading).map(stemToken))];
}

/**
 * Tokens that appear on at least half of a real heading set, and so cannot
 * separate one section from another. A single heading has no such tokens.
 */
export function commonHeadingTokens(headings: readonly string[]): Set<string> {
  const usable = headings.map((heading) => heading.trim()).filter((heading) => heading.length >= 4);
  if (usable.length < 4) return new Set();
  const counts = new Map<string, number>();
  for (const heading of usable) {
    for (const token of headingTokens(heading)) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const floor = usable.length / 2;
  const common = new Set<string>();
  for (const [token, count] of counts) {
    if (count >= floor) common.add(token);
  }
  return common;
}

export interface HeadingScore {
  readonly heading: string;
  readonly hits: number;
  readonly score: number;
}

export function scoreHeading(query: string, heading: string, common: ReadonlySet<string> = new Set()): HeadingScore {
  const title = headingTokens(heading).filter((token) => !common.has(token));
  const words = new Set(contentTokens(query).map(stemToken));
  const hits = title.filter((token) => words.has(token));
  return {
    heading,
    hits: hits.length,
    score: title.length === 0 ? 0 : hits.length / title.length,
  };
}

/** Whether this one heading is named by the query, given how common its tokens are. */
export function headingMatches(
  query: string,
  heading: string | null | undefined,
  common: ReadonlySet<string> = new Set(),
): boolean {
  if (!heading || heading.trim().length < 4) return false;
  const title = headingTokens(heading).filter((token) => !common.has(token));
  const scored = scoreHeading(query, heading, common);
  if (title.length === 0) return false;
  if (title.length === 1) return scored.hits === 1;
  return scored.hits >= 2 && scored.score >= 0.4;
}

export interface RankedHeading {
  readonly heading: string;
  readonly hits: number;
  readonly score: number;
}

/**
 * The heading the query names, or null when nothing matches or the top two
 * are too close to choose. Page numbers are not decided here.
 */
export function bestHeading(query: string, headings: readonly string[]): RankedHeading | null {
  const unique = [...new Set(headings.map((heading) => heading.trim()).filter((heading) => heading.length >= 4))];
  const common = commonHeadingTokens(unique);
  const ranked = unique
    .map((heading) => scoreHeading(query, heading, common))
    .filter((scored) => headingMatches(query, scored.heading, common))
    .sort((left, right) => right.score - left.score || right.hits - left.hits || left.heading.localeCompare(right.heading));
  const top = ranked[0];
  if (!top) return null;
  const next = ranked[1];
  if (next && top.heading.toLowerCase() !== next.heading.toLowerCase()) {
    const margin = top.score - next.score;
    if (margin < 0.15 && top.hits <= next.hits) return null;
  }
  return top;
}
