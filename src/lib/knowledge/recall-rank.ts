import type { MatchedChunkRow } from "./mappers";
import { hybridScore, type HybridCandidate } from "./hybrid-rank";
import { commonHeadingTokens, headingMatches } from "./section-rank";

/**
 * Guaranteed candidates. No similarity floor.
 *
 * The hybrid selector drops a row under the vector floor unless a keyword
 * rank or a title saves it. A named section with a weak embedding can
 * disappear that way. Here every fused candidate can occupy a top-N slot,
 * and a fuzzy or exact title is kept even past that N.
 */

export interface RecallCandidate extends HybridCandidate {
  readonly sectionSimilarity?: number | null;
}

const FUZZY_WORD = 0.5;

export function trigrams(value: string): Set<string> {
  const padded = `  ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const grams = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) grams.add(padded.slice(index, index + 3));
  return grams;
}

/** Dice coefficient over character trigrams. */
export function trigramSimilarity(left: string, right: string): number {
  const a = trigrams(left);
  const b = trigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function contentWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 5);
}

/** A heading word is close to a query word, by trigram, not by a synonym list. */
export function sectionFuzzyMatches(query: string, section: string | null | undefined): boolean {
  if (!section) return false;
  const tokens = contentWords(section);
  if (tokens.length === 0) return false;
  return contentWords(query).some((word) => tokens.some((token) => trigramSimilarity(word, token) >= FUZZY_WORD));
}

export function sectionIsNamed(
  query: string,
  section: string | null | undefined,
  exact = false,
  common: ReadonlySet<string> = new Set(),
): boolean {
  return exact || headingMatches(query, section, common) || sectionFuzzyMatches(query, section);
}

/**
 * Top-N by fused rank, plus every named section. Named sections lead so a
 * title the manager used is inside the window the reranker and the answer see.
 */
export function selectRecallCandidates(
  candidates: readonly RecallCandidate[],
  query: string,
  options: { readonly limit: number },
): { rows: MatchedChunkRow[]; pinnedIds: string[] } {
  const limit = Math.max(1, options.limit);
  const common = commonHeadingTokens(candidates.map((candidate) => candidate.row.section ?? ""));
  const scored = candidates.map((candidate) => {
    const named = sectionIsNamed(query, candidate.row.section, candidate.sectionExact, common);
    const sqlFuzzy = typeof candidate.sectionSimilarity === "number" && candidate.sectionSimilarity >= 0.3;
    return {
      row: candidate.row,
      named,
      keep: named || sqlFuzzy,
      score:
        hybridScore({
          vectorRank: candidate.vectorRank,
          keywordRank: candidate.keywordRank,
          sectionMatch: named || sqlFuzzy,
        }) + (candidate.sectionSimilarity ?? 0),
    };
  });
  scored.sort((a, b) => b.score - a.score || b.row.similarity - a.row.similarity);

  const chosen: typeof scored = [];
  const seen = new Set<string>();
  for (const item of scored) {
    if (seen.has(item.row.chunk_id)) continue;
    if (item.keep || chosen.length < limit) {
      chosen.push(item);
      seen.add(item.row.chunk_id);
    }
  }
  chosen.sort((a, b) => Number(b.named) - Number(a.named) || b.score - a.score);
  return {
    rows: chosen.map((item) => item.row),
    pinnedIds: chosen.filter((item) => item.named).map((item) => item.row.chunk_id),
  };
}
