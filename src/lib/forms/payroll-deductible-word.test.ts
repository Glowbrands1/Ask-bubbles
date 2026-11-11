import { afterEach, describe, expect, it, vi } from "vitest";

import { statedPayrollDeduct } from "./payroll-deduct-answer";

/**
 * PAYROLL_DEDUCTIBLE_WORD_ENABLED (ported from the sibling app's QA history, 25 Oct 2026; #140 rebuilt on main
 * 11 Nov 2026 with only this part, per QA's ruling that no live flag is extended): "payroll is deductable" (QA's
 * spelling) is the manager's Yes, "not payroll deductible" their No. Off, "payroll is deductable" is read as nothing.
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
    ["not payroll deductible", "no"],
    ["payroll is not deductable", "no"],
  ] as const)('on: "%s" is %s', (said, answer) => {
    vi.stubEnv("PAYROLL_DEDUCTIBLE_WORD_ENABLED", "true");
    expect(statedPayrollDeduct(said)).toBe(answer);
  });
});
