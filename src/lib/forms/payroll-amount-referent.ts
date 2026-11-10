/**
 * ============================================================================
 * AN AMOUNT, THEN "WHICH WILL BE PAYROLL DEDUCTED"
 * ============================================================================
 *
 * Live chat, 5 Nov 2026: "on 11-1-26 the register was off $20. which will be
 * payroll deducted from <name>'s check. … payroll deduct applies" was asked
 * "**Payroll deduction amount?**". The amount reader (`payroll-deduct.ts`)
 * reads "$20 will be payroll deducted"; here a relative word ("which", "that",
 * "this", "it") — and a stray full stop — stood between the two.
 *
 * Nothing new is read as money: the words between the figure and the clause
 * that refers back to it are dropped, and the result goes through the same
 * reader, which decides whether the figure is an amount ("$20", "20 dollars",
 * "3.25") and whether the clause is a payroll deduction. Only when the clause
 * starts at most three words before "deduct": "which will be payroll deducted",
 * "that will be deducted". Pure.
 */

/** A figure, then the word that refers back to it, then (within three words) "deduct…". */
const REFERS_BACK =
  /(\d(?:[\d,]*\d)?(?:\.\d{1,2})?(?:\s*(?:dollars?|bucks))?)\s*[.,;:–—-]?\s+(?:and\s+)?(?:which|that|this|it)\s+(?=(?:\S+\s+){0,3}?(?:payroll[- ]?\s*)?deduct)/gi;

/** The text with each "<amount>. which will be … deducted" joined to "<amount> will be … deducted". */
export function joinReferredAmount(text: string): string {
  return (text ?? "").replace(REFERS_BACK, "$1 ");
}
