import { classifyQuestionText } from "@/lib/analytics/taxonomy";
import { OFFICIAL_POLICY_MANUAL } from "@/lib/forms/official-policy-manual";

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

/**
 * The category the JBA Policy Manual is filed under. Other compliance
 * documents share it; a framework filed elsewhere does not.
 */
const POLICY_MANUAL_CATEGORY = "policies_compliance";

/**
 * Two first-place reciprocal-rank terms. Enough for a policy-manual keyword
 * hit to outrank a framework chunk that won the vector list, and smaller than
 * a section-title match.
 */
const POLICY_MANUAL_BOOST = 2 / (RRF_K + 1);

/** A policy question, from the activity taxonomy. No word-to-section map. */
export function isPolicyTypeQuestion(query: string): boolean {
  return classifyQuestionText(query) === "policy_question";
}

/** The manual's own title prefix, or the category that manual is filed under. */
export function isPolicyManualChunk(row: Pick<MatchedChunkRow, "document_title" | "category">): boolean {
  const title = row.document_title.trim().toLowerCase();
  if (OFFICIAL_POLICY_MANUAL.fallbackTitles.some((prefix) => title.startsWith(prefix.toLowerCase()))) {
    return true;
  }
  return row.category === POLICY_MANUAL_CATEGORY;
}

export function policyManualBoost(
  query: string,
  row: Pick<MatchedChunkRow, "document_title" | "category">,
): number {
  if (!isPolicyTypeQuestion(query) || !isPolicyManualChunk(row)) return 0;
  return POLICY_MANUAL_BOOST;
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
        score:
          hybridScore({
            vectorRank: candidate.vectorRank,
            keywordRank: candidate.keywordRank,
            sectionMatch,
          }) + policyManualBoost(query, candidate.row),
      };
    })
    .filter((item) => item.include)
    .sort((a, b) => b.score - a.score || b.row.similarity - a.row.similarity);

  return ranked.slice(0, Math.max(1, options.limit)).map((item) => item.row);
}
