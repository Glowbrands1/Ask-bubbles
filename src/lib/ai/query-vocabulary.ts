/**
 * ============================================================================
 * "OT RULES FOR MGRS?" — THE WORDS MANAGERS TYPE, AND THE WORDS POLICIES USE
 * ============================================================================
 *
 * Retrieval embeds the question as typed and keeps rows above a similarity
 * floor. A policy says "overtime", "paid time off" and "managers"; a manager
 * on a phone types "OT", "PTO" and "mgrs", or "attendence" and "harrasment".
 * The embedding of the shorthand sits further from the document than the
 * floor allows, the search returns nothing, and the answer says the knowledge
 * base has nothing — about a policy that is in it.
 *
 * WHAT THIS DOES. It produces a SECOND query, never a replacement:
 *
 *   - workplace shorthand is spelled out BESIDE the original word, so "OT"
 *     becomes "OT (overtime)": a document that really says "OT" still
 *     matches, and one that says "overtime" now does too;
 *   - a word within a small edit distance of a common HR word, and not itself
 *     a word on that list, is corrected ("attendence" → "attendance").
 *
 * The caller searches the question as typed AND this rewrite, and merges the
 * rows (`retrievalPlan`). Only the QUERY changes: the model is still given the
 * question exactly as the manager typed it, citations are still built only
 * from the rows the database returned, and the corpus and similarity floor are
 * untouched. A rewrite can therefore add a relevant document; it cannot put a
 * word in anybody's mouth.
 *
 * DELIBERATELY GENERIC. Nothing here names a company, a role title particular
 * to one business, or a policy figure. Company-specific titles belong in
 * `config/company/job-titles.ts`.
 */

/** Shorthand, matched as a whole word in any case, and what it stands for. */
const SHORTHAND: readonly [RegExp, string][] = [
  [/\bpto\b/gi, "paid time off"],
  [/\bot\b/gi, "overtime"],
  [/\bloa\b/gi, "leave of absence"],
  [/\bfmla\b/gi, "family and medical leave"],
  [/\bncns\b|\bnc\/ns\b/gi, "no call no show"],
  [/\bft\b/gi, "full-time"],
  [/\bpt\b/gi, "part-time"],
  [/\bmgrs\b/gi, "managers"],
  [/\bmgr\b|\bmngr\b|\bmanger\b/gi, "manager"],
  [/\basst\b/gi, "assistant"],
  [/\bdm\b/gi, "district manager"],
  [/\bgm\b/gi, "general manager"],
  [/\bsched\b|\bskd\b/gi, "schedule"],
  [/\bhrs\b/gi, "hours"],
  [/\bwk\b|\bwks\b/gi, "week"],
  [/\byr\b|\byrs\b/gi, "year"],
  [/\bbday\b|\bb-day\b/gi, "birthday"],
  [/\bw\/o\b/gi, "without"],
  [/\bw\/(?=\s|$)/gi, "with"],
  [/\bemp\b|\bemps\b|\bempl\b/gi, "employee"],
  [/\bppl\b/gi, "people"],
  [/\breqs?\b/gi, "request"],
  [/\bdoc\b/gi, "document"],
  [/\binfo\b/gi, "information"],
  [/\bbenies\b|\bbennies\b/gi, "benefits"],
  [/\bcallout\b|\bcall-out\b/gi, "call out"],
  [/\bdress\s*code\b/gi, "dress code"],
  [/\bwfh\b/gi, "work from home"],
  [/\bi-?9\b/gi, "employment eligibility verification"],
  [/\bw-?2\b/gi, "wage and tax statement"],
  [/\bw-?4\b/gi, "tax withholding form"],
  [/\bdd\b/gi, "direct deposit"],
  [/\bpaystub\b|\bpay\s*stub\b/gi, "pay statement"],
];

/**
 * Common HR words, the targets of spelling correction. Long enough that one or
 * two edits cannot turn one ordinary word into another ("leave" is absent:
 * "lease", "least" and "learn" are all one edit away).
 */
const HR_WORDS: readonly string[] = [
  "absence", "absences", "accommodation", "accrual", "accrue", "allowance", "attendance",
  "benefits", "bereavement", "breaks", "corrective", "disciplinary", "discipline",
  "discrimination", "dress", "employee", "employees", "employment", "evaluation",
  "grievance", "handbook", "harassment", "holiday", "holidays", "insurance", "lunch",
  "manager", "managers", "maternity", "medical", "overtime", "paternity", "paycheck",
  "payroll", "performance", "personal", "policy", "policies", "probation", "procedure",
  "promotion", "punctuality", "resignation", "retaliation", "schedule", "scheduling",
  "separation", "sickness", "supervisor", "suspension", "tardiness", "termination",
  "timecard", "training", "transfer", "uniform", "vacation", "warning", "workplace",
];
const HR_WORD_SET = new Set(HR_WORDS);

/** Ordinary words that are close to an HR word and must never be "corrected". */
const LEAVE_ALONE = new Set([
  "breaks", "brakes", "polite", "polish", "manage", "managed", "manages", "manner",
  "attendant", "attendants", "absent", "dresses", "dressed", "uniforms", "personnel",
  "medicine", "medication", "training", "trainer", "trainers", "trailing", "transform",
  "transport", "warming", "warring", "schedules", "scheduled", "employer", "employers",
  "promotions", "transfers", "insurer", "probate", "holidays", "holiday", "personal",
  "persona", "payrolls", "medical", "medics",
]);

/** Edits between two words; a swapped pair of adjacent letters counts as one. */
function editDistance(a: string, b: string): number {
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
 * The HR word `word` is a misspelling of, or null. Same first letter, at least
 * six letters, one edit (two for words of nine letters or more), and exactly
 * one candidate — a tie is not a correction.
 */
export function correctedHrWord(word: string): string | null {
  const lower = word.toLowerCase();
  if (lower.length < 6 || !/^[a-z]+$/.test(lower)) return null;
  if (HR_WORD_SET.has(lower) || LEAVE_ALONE.has(lower)) return null;
  const allowed = lower.length >= 9 ? 2 : 1;
  const hits = HR_WORDS.filter(
    (target) =>
      target[0] === lower[0] &&
      Math.abs(target.length - lower.length) <= allowed &&
      editDistance(lower, target) <= allowed,
  );
  if (hits.length === 0) return null;
  const best = Math.min(...hits.map((target) => editDistance(lower, target)));
  const closest = hits.filter((target) => editDistance(lower, target) === best);
  return closest.length === 1 ? closest[0]! : null;
}

/**
 * The question with shorthand spelled out and HR misspellings corrected, or
 * null when there was nothing to rewrite. The original words are kept where a
 * shorthand is expanded, so the rewrite only ever adds vocabulary.
 */
export function normalizeRetrievalQuery(question: string): string | null {
  const original = (question ?? "").trim();
  if (original.length === 0) return null;

  let rewritten = original;
  for (const [pattern, expansion] of SHORTHAND) {
    rewritten = rewritten.replace(pattern, (match) =>
      match.toLowerCase() === expansion.toLowerCase() ? match : `${match} (${expansion})`,
    );
  }
  rewritten = rewritten.replace(/[A-Za-z]+/g, (word) => correctedHrWord(word) ?? word);

  return rewritten === original ? null : rewritten;
}
