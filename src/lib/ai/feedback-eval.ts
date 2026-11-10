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
  /** FEWSHOT_TURN_JOIN_ENABLED: the rated assistant answer, the example's output (as the sibling app shows it). */
  readonly answer?: string | null;
}

/** FEWSHOT_TURN_JOIN_ENABLED: an example answer is cut here, so a long answer cannot crowd the prompt. */
const ANSWER_CAP = 1500;

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
  /*
   * FEWSHOT_TURN_JOIN_ENABLED (QA, 10 Nov 2026): with the rated answers read, each example is the question and the
   * answer it was rated for, redacted, as the sibling app's few-shot block shows them. Without answers (the flag
   * off), the questions alone, as before.
   */
  if (picked.some((row) => row.answer?.trim())) {
    const body = picked
      .map((row, index) => {
        const asked = redactReplayText(row.question, places);
        const answered = redactReplayText((row.answer ?? "").slice(0, ANSWER_CAP), places);
        return `Example ${index + 1}, rated ${row.rating}:\nManager: ${asked}\nAssistant: ${answered}`;
      })
      .join("\n\n");
    return `SIMILAR PAST ANSWERS THIS COMPANY RATED HIGHLY\n\nThese are examples of shape from other conversations at this company. They are not this conversation and not something the manager said earlier today. Do not tell the manager they mentioned a person, a date, or an event from an example. Do not copy a name, a date, a figure, or a policy from them unless the sources for this question also say it.\n\n${body}`;
  }
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
