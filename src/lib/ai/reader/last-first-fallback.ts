import type { CheckContext } from "./check";
import { lastFirstResult } from "./last-first";
import type { ReaderResult } from "./read";

/**
 * ============================================================================
 * LAST_FIRST_AI_FALLBACK_ENABLED — "CALDER, REMY" WHEN THE AI READER GIVES NO EMPLOYEE
 * ============================================================================
 *
 * QA's audit of the sibling app's #352 (6 Nov 2026): the last-first reading
 * (`last-first.ts`) ran only with the AI reader off. With it on, as in
 * production, a reply with no employee, a timeout or an error left "<Last>,
 * <First>" unread and the card was for "<Last>".
 *
 *   the AI reader fell back (timeout, error, unusable)  -> the last-first reading, if it finds one person
 *   the AI reader read no roster person                 -> its other fields, with the last-first employee
 *   the AI reader read a roster person                  -> left alone
 *
 * The AI reader returning only the "<Last>" word of a "<Last>, <First>" the
 * manager typed is one of the first two rows: the reader's checks (`check.ts`
 * nameFits) give a lone "Calder" a person only when it fits exactly one
 * person, and the pair's person always fits it, so that person IS the pair's;
 * when "Calder" fits two people it is no employee, and the pair decides. The
 * last-first reading is `last-first.ts`'s, unchanged: no new name parser.
 */
export function withLastFirstFallback(
  read: ReaderResult | { readonly fallback: string },
  context: CheckContext,
): ReaderResult | { readonly fallback: string } {
  if ("checked" in read && read.checked.employee?.person) return read;
  const lastFirst = lastFirstResult(context);
  if (!lastFirst) return read;
  if (!("checked" in read)) return lastFirst;
  return {
    ...read,
    checked: { ...read.checked, employee: lastFirst.checked.employee },
    reading: { ...read.reading, employee: lastFirst.reading.employee },
  };
}
