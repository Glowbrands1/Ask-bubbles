/**
 * The payroll-deduct answer ONE message states — "no payroll deduct", "payroll
 * deduct of $3.25 is applicable", "we aren't docking her pay". See
 * `payroll-deduct.ts` for the question, the form's options and reading a
 * whole conversation.
 *
 * Pure, browser-safe, and IMPORTS NOTHING: the warning-level reader uses it,
 * and `payroll-deduct.ts` imports the form-request reader, which imports the
 * warning-level reader — so living there made an import cycle (QA, 22 Oct 2026).
 */

export type PayrollDeductAnswer = "yes" | "no";

/** "payroll deduct", "payroll deduction(s)", "payroll", "deduction". */
// "payroll ded", "payroll ded." — the abbreviation, after "payroll" only (QA, 22 Oct 2026, round 3).
const SUBJECT = String.raw`(?:payroll\s+deduct(?:ion|ions|ed)?|payroll\s+ded\.?(?=\s|:|=|-|$)|payroll|deduct(?:ion|ions)?)`;

/*
 * "PAYROLL DEDUCT OF $3.25 IS APPLICABLE" — the subject, what it is of or for,
 * then the answer. District Manager feedback, 21 Oct 2026: the amount between
 * them hid the answer and the manager was asked "Yes or No?". At most a few
 * words between, within the clause; the negative is read first.
 */
const OF_WHAT = String.raw`\s+(?:of|for|on)\s+(?:[^.!?;\n]|\.(?=\d)){1,30}?\s+`;
const NEGATIVE: readonly RegExp[] = [
  // "payroll deduct of $3.25 is not applicable"
  new RegExp(
    String.raw`\b${SUBJECT}${OF_WHAT}(?:is\s+|does\s+|would\s+|will\s+)?(?:not|n't|isn't|doesn't|won't|wont|isnt|doesnt)\s+(?:be\s+)?(?:applicable|apply|applies|needed|required|necessary)\b`,
  ),
  // "no payroll deduct", "no deduction", "no to payroll deduction", "no, payroll"
  new RegExp(String.raw`\bno\b[\s,:-]*(?:to\s+)?(?:the\s+|a\s+)?${SUBJECT}\b`),
  // "payroll deduct is not applicable", "payroll deduction doesn't apply"
  new RegExp(
    String.raw`\b${SUBJECT}\s+(?:is\s+|does\s+|would\s+|will\s+)?(?:not|n't|isn't|doesn't|won't|wont|isnt|doesnt)\s+(?:be\s+)?(?:applicable|apply|applies|needed|required|necessary)\b`,
  ),
  // "payroll deduct: no", "payroll deduct applicable - no", "payroll deduct = n/a"
  new RegExp(String.raw`\b${SUBJECT}(?:\s+applicable)?\s*[:=-]\s*(?:no|n|none|n/a|not applicable)(?:$|[\s.,!;])`),
  // "payroll deduct no", "payroll deduction applicable no" — the answer last in its clause, not "no longer"
  new RegExp(String.raw`\b${SUBJECT}(?:\s+applicable)?\s+(?:no|n|nope)\s*(?:$|[.,!;|/]|-\s)`),
  // "payroll deduct n/a", "payroll deduction not applicable", "payroll deduct none"
  new RegExp(String.raw`\b${SUBJECT}(?:\s+applicable)?\s+(?:is\s+)?(?:n/a|not applicable|none)(?:$|[\s.,!;])`),
  // "we won't deduct", "don't deduct it from her pay", "not deducting"
  /\b(?:don't|dont|do not|won't|wont|will not|not|no need to|shouldn't|should not)\s+(?:be\s+)?deduct(?:ing|ed)?\b/,
  /\bwithout\s+(?:a\s+|any\s+)?(?:payroll\s+)?deduction\b/,
  /*
   * "We aren't docking her pay", "not taking it out of her check", "no pay
   * deduction" — the same answer without the form's words (QA, 22 Oct 2026,
   * round 3).
   */
  /\b(?:don't|dont|do not|won't|wont|will not|not|aren't|arent|are not|isn't|is not|no need to|shouldn't|should not)\s+(?:be\s+)?(?:going\s+to\s+)?dock(?:ing|ed)?\b/,
  /\bno\s+(?:pay\s+)?docking\b|\bno\s+pay\s+deduction\b/,
  /\b(?:don't|dont|do not|won't|wont|will not|not|aren't|are not|no need to)\s+(?:be\s+)?(?:going\s+to\s+)?(?:tak(?:e|ing)|com(?:e|ing))\s+(?:it\s+|anything\s+|that\s+|this\s+)?out\s+of\s+(?:her|his|their)\s+(?:pay|paycheck|check|wages)\b/,
];

const POSITIVE: readonly RegExp[] = [
  // "payroll deduct of $3.25 is applicable", "payroll deduction for the shortage applies"
  new RegExp(
    String.raw`\b${SUBJECT}${OF_WHAT}(?:is\s+|does\s+|will\s+|would\s+)?(?:be\s+)?(?:applicable|applies|apply|needed|required|necessary)\b`,
  ),
  // "yes payroll deduct applies", "yes to payroll deduction", "yes, deduction"
  new RegExp(String.raw`\byes\b[\s,:-]*(?:to\s+)?(?:the\s+|a\s+)?${SUBJECT}\b`),
  // "payroll deduct applies", "payroll deduction is applicable", "payroll deduct needed"
  new RegExp(
    String.raw`\b${SUBJECT}\s+(?:is\s+|does\s+|will\s+|would\s+)?(?:be\s+)?(?:applicable|applies|apply|needed|required|necessary)\b`,
  ),
  // "payroll deduct: yes", "payroll deduct applicable - yes"
  new RegExp(String.raw`\b${SUBJECT}(?:\s+applicable)?\s*[:=-]\s*(?:yes|y)(?:$|[\s.,!;])`),
  // "payroll deduct yes", "payroll deduction applicable yes"
  new RegExp(String.raw`\b${SUBJECT}(?:\s+applicable)?\s+(?:yes|y)\s*(?:$|[.,!;|/]|-\s)`),
  // "deduct it from her paycheck", "deducting the shortage from payroll"
  /\bdeduct(?:ing|ed)?\b[^.\n]{0,40}\bfrom\s+(?:her|his|their|the|its)?\s*(?:pay|paycheck|payroll|check|wages)\b/,
  // "it will be deducted", "we'll deduct", "needs to be deducted", "$25 will be payroll deducted"
  /\b(?:will|we'll|we will|going to|should|needs? to|has to|have to)\s+(?:be\s+)?(?:payroll\s+)?deduct(?:ed)?\b/,
  // "payroll deduct $25", "deduct $3.25", "deduction of $25" — an amount to take is a yes
  /\b(?:payroll\s+)?deduct(?:ion|ed|ing)?\s+(?:of\s+|for\s+)?\$\s?\d/,
  // "$25 payroll deduction", "$25 payroll deduct"
  /\$\s?\d[\d,]*(?:\.\d{1,2})?\s+payroll\s+deduct/,
  // "dock her pay", "take it out of her check", "it comes out of his pay"
  /\bdock(?:ing|ed)?\s+(?:her|his|their)\s+(?:pay|paycheck|check|wages)\b/,
  /\b(?:take|taking|comes?|coming)\s+(?:it\s+|that\s+|this\s+|the\s+\w+\s+)?out\s+of\s+(?:her|his|their)\s+(?:pay|paycheck|check|wages)\b/,
];

/** Lower case, curly quotes straightened, "payroll-deduct" spaced — the text the patterns read. */
export function normalizePayrollWording(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    // "payroll-deduct", "payroll‑deduction"
    .replace(/[‐‑–—]/g, "-")
    .replace(/\bpayroll-deduct/g, "payroll deduct")
    .replace(/[^\S\n]+/g, " ");
}

/**
 * The answer a sentence STATES about payroll deduction, or null.
 *
 * Read clause by clause, latest clause last, so "yes payroll deduct — actually
 * no, no deduction" ends on no. A clause that is itself a question ("is
 * payroll deduct applicable?") states nothing — except where the manager
 * answered it in the same breath ("payroll deduct applicable? no").
 *
 * Within one clause a negative wins: "payroll deduction doesn't apply" contains
 * "payroll deduction ... apply", and reading that as yes would be the worst
 * available mistake on a record about someone's pay.
 */
export function statedPayrollDeduct(text: string): PayrollDeductAnswer | null {
  // An answered question is a statement: "…applicable? no" -> "…applicable: no".
  const source = normalizePayrollWording(text).replace(/\?\s*(yes|no|y|n)\b/g, ": $1");
  let answer: PayrollDeductAnswer | null = null;

  // A point inside an amount ("$3.25") does not end a clause.
  for (const clause of source.split(/(?<=[!?;\n]|\.(?!\d))/)) {
    const trimmed = clause.trim();
    if (trimmed === "" || trimmed.endsWith("?")) continue;
    if (NEGATIVE.some((pattern) => pattern.test(trimmed))) answer = "no";
    else if (POSITIVE.some((pattern) => pattern.test(trimmed))) answer = "yes";
  }

  return answer;
}
