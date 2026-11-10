import { afterEach, describe, expect, it, vi } from "vitest";

import { joinReferredAmount } from "./payroll-amount-referent";
import { managerPayrollAmount, payrollAmountPrompt, statedPayrollDeductAmount } from "./payroll-deduct-amount";

/*
 * Live chat, 5 Nov 2026, word for word (the employee is invented): the $20 in
 * the same message was not read, and "**Payroll deduction amount?**" was asked.
 */
const SAID =
  "create a verbal ca for marnie holloway. on 11-1-26 the register was off $20. which will be payroll deducted from Marnie's check. previous coaching was jba policy manual on 8-1-26. payroll deduct applies";

afterEach(() => vi.unstubAllEnvs());

describe("PAYROLL_AMOUNT_SAME_MESSAGE_ENABLED: \"$20. which will be payroll deducted\"", () => {
  it("off: the amount is not read and the amount is asked (the live behaviour)", () => {
    vi.stubEnv("PAYROLL_DEDUCT_AMOUNT_ENABLED", "true");
    expect(managerPayrollAmount(SAID)).toBeNull();
    expect(payrollAmountPrompt({ payroll: "yes", managerText: SAID, assistantMessages: [] })).toMatch(/Payroll deduction amount\?/);
  });

  it("on: the $20 is the amount, and it is read back instead of asked", () => {
    vi.stubEnv("PAYROLL_DEDUCT_AMOUNT_ENABLED", "true");
    vi.stubEnv("PAYROLL_AMOUNT_SAME_MESSAGE_ENABLED", "true");
    expect(managerPayrollAmount(SAID)).toBe("$20");
    expect(statedPayrollDeductAmount(SAID)).toBe("$20");
    const prompt = payrollAmountPrompt({ payroll: "yes", managerText: SAID, assistantMessages: [] }) ?? "";
    expect(prompt).not.toMatch(/Payroll deduction amount\?/);
    expect(prompt).toMatch(/Payroll deduction amount:\*\* \$20/);
  });

  it("on: other ways of referring back", () => {
    vi.stubEnv("PAYROLL_AMOUNT_SAME_MESSAGE_ENABLED", "true");
    expect(managerPayrollAmount("the drawer was short $12.50, which will be deducted from her pay")).toBe("$12.50");
    expect(managerPayrollAmount("she owes 30 dollars and that will be payroll deducted")).toBe("$30");
  });

  it("on: an amount not referred to by the deduction is not read", () => {
    vi.stubEnv("PAYROLL_AMOUNT_SAME_MESSAGE_ENABLED", "true");
    expect(managerPayrollAmount("the register was $40 short. that is the third time this month. payroll deduct applies")).toBeNull();
    expect(managerPayrollAmount("she was 20 minutes late, which is why payroll deduct applies")).toBeNull();
    expect(joinReferredAmount("on 11-1-26 it happened")).toBe("on 11-1-26 it happened");
  });
});

describe("PAYROLL_AMOUNT_SAME_MESSAGE_ENABLED: the clause after the stray full stop is not a question", () => {
  it("off: it is set aside as a question (the live \"You also asked\")", async () => {
    const { separateQuestions } = await import("./message-parts");
    expect(separateQuestions(SAID).questions).toEqual(["which will be payroll deducted from Marnie's check."]);
  });

  it("on: it stays with the account; a real \"which\" question is still one", async () => {
    vi.stubEnv("PAYROLL_AMOUNT_SAME_MESSAGE_ENABLED", "true");
    const { separateQuestions } = await import("./message-parts");
    expect(separateQuestions(SAID).questions).toEqual([]);
    expect(separateQuestions("make a ca for marnie holloway. which store is she at").questions).toEqual(["which store is she at"]);
    expect(separateQuestions("which is the attendance policy?").questions).toEqual(["which is the attendance policy?"]);
  });
});
