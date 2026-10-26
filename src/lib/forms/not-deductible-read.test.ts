import { afterEach, describe, expect, it } from "vitest";

import { payrollDeductFromConversation } from "./payroll-deduct";
import { statedPayrollDeduct } from "./payroll-deduct-answer";

/*
 * NOT_DEDUCTIBLE_READ_ENABLED. A manager in the sibling app, 26 Oct 2026: an
 * account ending "… verbal warning received … not payroll deductible <title>"
 * was not read as a payroll answer, and "Is payroll deduct applicable?" was
 * asked on every turn. Invented name; lowercase and Sentence case.
 */
const FLAG = "NOT_DEDUCTIBLE_READ_ENABLED";
const saved = process.env[FLAG];
afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
});

const ACCOUNT = "Quinn Marlowe today under performance for September, verbal warning received Coaching 9/8/2026 not payroll deductible Team Member";

describe(`${FLAG} on`, () => {
  it.each([ACCOUNT, ACCOUNT.toLowerCase()])("%s: the account answers No", (turn) => {
    process.env[FLAG] = "true";
    expect(payrollDeductFromConversation([{ role: "user", content: turn }])).toBe("no");
  });

  it.each(["not payroll deductible", "Not payroll deductible", "non-deductible", "is not deductible"])("%s reads No", (words) => {
    process.env[FLAG] = "true";
    expect(statedPayrollDeduct(words)).toBe("no");
  });

  it.each(["payroll deductible", "it is deductible from payroll", "payroll deduct yes"])("%s is never read as No", (words) => {
    process.env[FLAG] = "true";
    expect(statedPayrollDeduct(words)).not.toBe("no");
  });
});

describe(`${FLAG} off: as main`, () => {
  it("the account answers nothing", () => {
    delete process.env[FLAG];
    expect(payrollDeductFromConversation([{ role: "user", content: ACCOUNT }])).toBeNull();
  });

  it("the flag reads off by default", async () => {
    delete process.env[FLAG];
    const { notDeductibleReadEnabled } = await import("@/lib/config/chat-quality-flags");
    expect(notDeductibleReadEnabled()).toBe(false);
  });
});
