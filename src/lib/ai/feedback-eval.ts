import { trigramSimilarity } from "./intake-augment";
import { redactReplayText, replayCasesFromFeedback } from "./feedback-redact.mjs";

export { redactReplayText, replayCasesFromFeedback };

/**
 * A highly rated exchange the prompt may show.
 *
 * The question comes from a chat trace when one exists. The comment is the
 * manager's own note. The answer text is not stored on assistant_feedback,
 * and this does not add a column for it.
 */

export interface RatedExchange {
  readonly rating: number;
  readonly question: string;
  readonly comment: string | null;
}

export function similarExchanges(
  question: string,
  rows: readonly RatedExchange[],
  limit = 3,
): RatedExchange[] {
  const wanted = tokens(question);
  return rows
    .filter((row) => row.rating === 5 && row.question.trim() !== "")
    .map((row) => ({
      row,
      score: trigramSimilarity(question, row.question),
      shared: shares(wanted, tokens(row.question)),
    }))
    .filter((item) => item.shared)
    .sort((left, right) => right.score - left.score || left.row.question.localeCompare(right.row.question))
    .slice(0, limit)
    .map((item) => item.row);
}

export function formatFewShot(
  question: string,
  rows: readonly RatedExchange[],
  places: readonly string[],
): string | null {
  const picked = similarExchanges(question, rows);
  if (picked.length === 0) return null;
  const lines = picked.map((row, index) => {
    const asked = redactReplayText(row.question, places);
    const note = row.comment?.trim() ? ` The manager noted: ${redactReplayText(row.comment, places)}` : "";
    return `${index + 1}. A manager asked: ${asked}.${note}`;
  });
  return `HIGHLY RATED EXCHANGES\n\nThese questions were rated highly. Follow their directness. Do not copy a name or a store from them; they are redacted.\n\n${lines.join("\n")}`;
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((word) => word.length >= 4),
  );
}

function shares(left: Set<string>, right: Set<string>): boolean {
  if (left.size === 0 || right.size === 0) return false;
  for (const word of left) if (right.has(word)) return true;
  return false;
}
