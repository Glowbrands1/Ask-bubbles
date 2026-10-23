import type { MatchedChunkRow } from "./mappers";
import { commonHeadingTokens, headingMatches } from "./section-rank";

/**
 * Reciprocal rank fusion of a vector list and a keyword list, plus a
 * section-title boost. Pure: the SQL returns the ranks, this decides the order.
 *
 * A section the question names outranks a merely similar chunk. That is how
 * a heading the manager described can lead a chunk the embedding preferred.
 */

export const RRF_K = 60;

export function hybridScore(input: {
  vectorRank: number | null;
  keywordRank: number | null;
  sectionMatch: boolean;
}): number {
  let score = 0;
  if (input.vectorRank && input.vectorRank > 0) score += 1 / (RRF_K + input.vectorRank);
  if (input.keywordRank && input.keywordRank > 0) score += 1 / (RRF_K + input.keywordRank);
  if (input.sectionMatch) score += 1;
  return score;
}

export interface HybridCandidate {
  readonly row: MatchedChunkRow;
  readonly vectorRank: number | null;
  readonly keywordRank: number | null;
  /** The SQL found the section title as a substring of the query. */
  readonly sectionExact: boolean;
}

/**
 * Keep a vector hit at or above the floor, a named section, or a strong
 * keyword hit. Weak keyword noise stays out, so an off-topic question still
 * comes back empty.
 */
export function selectHybridMatches(
  candidates: readonly HybridCandidate[],
  query: string,
  options: { readonly vectorFloor: number; readonly limit: number },
): MatchedChunkRow[] {
  const headings = candidates.map((candidate) => candidate.row.section ?? "");
  const common = commonHeadingTokens(headings);
  const ranked = candidates
    .map((candidate) => {
      const sectionMatch =
        candidate.sectionExact || headingMatches(query, candidate.row.section, common);
      const aboveFloor = candidate.row.similarity >= options.vectorFloor && candidate.vectorRank !== null;
      const strongKeyword = candidate.keywordRank !== null && candidate.keywordRank <= 3;
      return {
        row: candidate.row,
        include: aboveFloor || sectionMatch || strongKeyword,
        score: hybridScore({
          vectorRank: candidate.vectorRank,
          keywordRank: candidate.keywordRank,
          sectionMatch,
        }),
      };
    })
    .filter((item) => item.include)
    .sort((a, b) => b.score - a.score || b.row.similarity - a.row.similarity);

  return ranked.slice(0, Math.max(1, options.limit)).map((item) => item.row);
}
