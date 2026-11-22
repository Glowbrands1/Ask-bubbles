import { editDistance } from "@/lib/forms/employee-match";

/**
 * Whether the manager's quoted words name a form option by its own label (round 2, U24): at least half of the label's
 * words (letters only, three or more), each said exactly, as a prefix of three letters or more ("Vol" for Voluntary), or
 * as a close spelling ("volunatary"). Read from the label, never a list of phrasings.
 */
export function quoteNamesOption(quote: string, label: string): boolean {
  const wordsOf = (text: string) => [...new Set((text.toLowerCase().match(/[a-z]+/g) ?? []).filter((word) => word.length >= 3))];
  const labelWords = wordsOf(label);
  const said = (text: string) => (text.toLowerCase().match(/[a-z]+/g) ?? []);
  /* "didn't" is "did not": the contraction's own two words, so "didn't fulfill her notice" names "Did not fulfill … notice". */
  const quoted = said(quote.replace(/([a-z])n['’]t\b/gi, "$1 not"));
  if (labelWords.length === 0) return false;
  /*
   * Ported from the sibling app (QA, 22 Nov 2026, #1215): a word sharing a stem of six letters or more with a label word
   * names it ("fulfilling" names "Fulfilled"). A typed word that only starts with a short label word never names it:
   * "notice" is not the label's "not" (it made "gave 2 weeks notice and is fulfilling them" name "Did not fulfill … notice").
   */
  const stem = (a: string, b: string) => {
    let shared = 0;
    while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared += 1;
    return shared >= 6;
  };
  const named = labelWords.filter((word) =>
    quoted.some((typed) => typed === word || (typed.length >= 3 && word.startsWith(typed)) || (word.length >= 4 && typed.startsWith(word)) || stem(typed, word) || (typed.length >= 5 && word.length >= 5 && editDistance(typed, word) <= 2)),
  );
  return named.length >= Math.max(1, Math.ceil(labelWords.length / 2)) && (labelWords.length < 2 || named.length >= 2);
}
