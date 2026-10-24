import { payrollDeductAmountFieldEnabled } from "@/lib/config/chat-quality-flags";

import { field } from "./catalog";
import type { FormBlock, FormDocument } from "./document";
import { PAYROLL_DEDUCT_KEY, payrollDeductAmount } from "./payroll-deduct";

/**
 * The Corrective Action amount line, placed immediately after
 * "Is payroll deduct applicable?".
 *
 * The amount is whatever the manager stated (`payrollDeductAmount`). A figure
 * the cited policy states is never copied onto this line. The line is blank,
 * and nothing is asked, unless payroll deduct is Yes — then the amount is
 * asked once.
 */

export const PAYROLL_DEDUCT_AMOUNT_KEY = "payroll_deduct_amount";

/** The label on the form, the card, and the PDF. */
export const PAYROLL_DEDUCT_AMOUNT_LABEL = "Payroll deduction amount";

/** The one key a stated amount may write — see `applyStatedFacts`. */
export const PAYROLL_DEDUCT_AMOUNT_STATED_KEYS: ReadonlySet<string> = new Set([
  PAYROLL_DEDUCT_AMOUNT_KEY,
]);

/**
 * Asked once, when payroll deduct is Yes and the manager has not stated an
 * amount. The bold question is how a later turn knows it was already asked.
 */
export const PAYROLL_DEDUCT_AMOUNT_QUESTION =
  "One more question: **Payroll deduction amount?** Tell me the amount here, or fill it on the form — I won't choose it for you.";

const ASKED = "**Payroll deduction amount?**";

/** A bare amount, only after that question: "$3.25", "3.25", "25 dollars". */
const BARE_AMOUNT =
  /^\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?:\s*dollars?)?[.!]?\s*$/i;

function dollars(written: string): string | null {
  const amount = `$${written.replace(/\s+/g, "")}`;
  return Number(amount.replace(/[$,]/g, "")) === 0 ? null : amount;
}

/**
 * The amount to store from a manager's words. Policy text is not read.
 * A reply that is only an amount counts only after the amount question.
 */
export function statedPayrollDeductAmount(text: string, lastAssistant = ""): string | null {
  const stated = payrollDeductAmount(text);
  if (stated) return stated;
  if (!lastAssistant.includes(ASKED)) return null;
  const bare = BARE_AMOUNT.exec(text.trim());
  return bare ? dollars(bare[1]!) : null;
}

/**
 * The sentence under the payroll Yes/No read-back, or null when the flag is
 * off, payroll is not Yes, or the amount was already asked.
 */
export function payrollAmountPrompt(input: {
  payroll: "yes" | "no" | null | undefined;
  managerText: string;
  assistantMessages: readonly string[];
}): string | null {
  if (!payrollDeductAmountFieldEnabled()) return null;
  if (input.payroll !== "yes") return null;
  const stated = payrollDeductAmount(input.managerText);
  if (stated) {
    return `**${PAYROLL_DEDUCT_AMOUNT_LABEL}:** ${stated} — tell me if that should change.`;
  }
  if (input.assistantMessages.some((message) => message.includes(ASKED))) return null;
  return PAYROLL_DEDUCT_AMOUNT_QUESTION;
}

/** The block inserted after the payroll Yes/No group. A manager field, optional. */
export function payrollDeductAmountBlock(): FormBlock {
  return {
    kind: "field",
    field: field(
      PAYROLL_DEDUCT_AMOUNT_KEY,
      PAYROLL_DEDUCT_AMOUNT_LABEL,
      "manager",
      "text",
    ),
  };
}

/**
 * The same document, with the amount field immediately after the payroll
 * Yes/No group. Unchanged when the flag is off, when the group is absent,
 * or when the field is already there. Does not mutate `document`.
 */
export function withPayrollDeductAmountField(document: FormDocument): FormDocument {
  if (!payrollDeductAmountFieldEnabled()) return document;
  if (
    document.blocks.some(
      (block) => block.kind === "field" && block.field.key === PAYROLL_DEDUCT_AMOUNT_KEY,
    )
  ) {
    return document;
  }
  const at = document.blocks.findIndex(
    (block) => block.kind === "checkbox_group" && block.key === PAYROLL_DEDUCT_KEY,
  );
  if (at < 0) return document;
  const blocks = document.blocks.slice();
  blocks.splice(at + 1, 0, payrollDeductAmountBlock());
  return { ...document, blocks };
}
