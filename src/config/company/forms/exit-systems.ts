/**
 * THE SYSTEMS THE EXIT FORM'S STEPS TO FINISH TERMINATION NAME.
 *
 * Read by the exit form's steps (`exit-library.ts`), the chat line that says
 * the draft does none of them (`exit-intake.ts`) and the drafting rule that
 * forbids claiming they were done (`exit-draft.ts`), so the name is written
 * once.
 *
 * THE SCHEDULING/HR SYSTEM IS NOT CONFIRMED YET (QA, 25 Oct 2026). The
 * reference platform's step named MyGlow; whether Buff City Soap uses it has
 * not been confirmed, so the text says "the scheduling/HR system" until it
 * is. If the business confirms MyGlow, set this to "MyGlow": the step then
 * reads "…remove employee from MyGlow." exactly as the source form printed
 * it. That also needs, in the same change: the exit seed's revision bumped
 * (`exit-library.ts`) so production republishes it, the QA-1 entry dropped
 * from `src/test/fixtures/approved-template-changes.json` and
 * `template-parity.test.ts`, and MyGlow taken off the ban list in
 * `exit-sibling-wording.test.ts`.
 */
export const EXIT_EMPLOYEE_SYSTEM = "the scheduling/HR system";

/**
 * Sunlync is confirmed (Pau, via QA, 25 Oct 2026): Buff City Soap uses it too,
 * so its step keeps the source wording, without the tanning clause.
 */
export const EXIT_ACCOUNT_SYSTEM = "Sunlync";
