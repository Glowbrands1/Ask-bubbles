import { afterEach, describe, expect, it, vi } from "vitest";

import { statedPayrollDeduct } from "./payroll-deduct-answer";

/**
 * PAYROLL_DEDUCTIBLE_WORD_ENABLED (ported from the sibling app's QA history, 25 Oct 2026; #140 rebuilt on main
 * 11 Nov 2026 with only this part, per QA's ruling that no live flag is extended): "payroll is deductable" (QA's
 * spelling) is the manager's Yes. A negated "not payroll deductible" is never this flag's Yes; its No stays with the live
 * NOT_DEDUCTIBLE_READ_ENABLED (QA, 11 Nov 2026: one reader per answer). Off, "payroll is deductable" is read as nothing.
 */
afterEach(() => vi.unstubAllEnvs());

describe("PAYROLL_DEDUCTIBLE_WORD_ENABLED", () => {
  it('off: "payroll is deductable" is read as nothing, as in production', () => {
    vi.stubEnv("PAYROLL_DEDUCTIBLE_WORD_ENABLED", "");
    expect(statedPayrollDeduct("payroll is deductable")).toBeNull();
  });

  it.each([
    ["payroll is deductable", "yes"],
    ["payroll is deductible", "yes"],
    ["payroll will be deductable", "yes"],
  ] as const)('on: "%s" is %s', (said, answer) => {
    vi.stubEnv("PAYROLL_DEDUCTIBLE_WORD_ENABLED", "true");
    expect(statedPayrollDeduct(said)).toBe(answer);
  });

  it.each(["not payroll deductible", "payroll is not deductable"])('on: "%s" is never this flag\'s Yes', (said) => {
    vi.stubEnv("PAYROLL_DEDUCTIBLE_WORD_ENABLED", "true");
    vi.stubEnv("NOT_DEDUCTIBLE_READ_ENABLED", "");
    expect(statedPayrollDeduct(said)).not.toBe("yes");
  });

  // The live reader's No covers "not payroll deductible"; the misspelt "payroll is not deductable" is not read as No by
  // it (asked again, never Yes): that is NOT_DEDUCTIBLE_READ's reading, not this flag's, and is reported to QA.
  it.each(["not payroll deductible"])('on, with the live NOT_DEDUCTIBLE_READ: "%s" is its No', (said) => {
    vi.stubEnv("PAYROLL_DEDUCTIBLE_WORD_ENABLED", "true");
    vi.stubEnv("NOT_DEDUCTIBLE_READ_ENABLED", "true");
    expect(statedPayrollDeduct(said)).toBe("no");
  });
});
