/**
 * ============================================================================
 * THE WARNING LEVELS AS THEY GET TYPED, SPELLED OUT
 * ============================================================================
 *
 * Pure, browser-safe, and IMPORTS NOTHING, on purpose. Both the form-request
 * reader (`template-intent.ts`) and the warning-level reader (`warning-level.ts`)
 * rewrite "writen warnig" before reading, and `template-intent.ts` in turn asks
 * the level reader whether a level was stated. With this rewrite inside
 * `template-intent.ts` the three modules formed an import cycle — harmless
 * only while nothing read an imported value at load time; one such read makes a
 * production build fail while every unit test still passes (QA, 22 Oct 2026).
 * So it lives here, and a test keeps the forms readers free of cycles.
 */

/** Edits between two words, a swapped pair of letters ("actoin") counting as one. */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * "writen warning", "written warnig", "verbel warning" — the warning levels as
 * they get typed on a phone, spelled out. Owner's retest variants, 9 Oct 2026:
 * "jordan testperson needs a writen warning for cash handling" was answered as
 * a question. Both words must be close (one edit for the level, two for
 * "warning"), so "writing warnings" and "verbal warmup" are left alone.
 */
export function canonicalWarningWording(text: string): string {
  return text
    // "a verbal corrective", "written corrective for …" — the noun left off (QA, 22 Oct 2026, round 3).
    .replace(/\b(verbal|written)\s+corrective\b(?!\s+actions?\b)/gi, "$1 corrective action")
    .replace(/\b([a-z]{5,8})\s+(w[a-z]{4,8})\b/gi, (match, first: string, second: string) => {
    const a = first.toLowerCase();
    const b = second.toLowerCase();
    if (editDistance(b, "warning") > 2 || b === "warnings" || b.startsWith("warm")) return match;
    if (a !== "writing" && a !== "written" && editDistance(a, "written") <= 1) return "written warning";
    if (a !== "verbal" && editDistance(a, "verbal") <= 1) return "verbal warning";
    if ((a === "written" || a === "verbal") && b !== "warning") return `${a} warning`;
    return match;
  });
}
