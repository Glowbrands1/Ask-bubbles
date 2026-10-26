import { afterEach, describe, expect, it } from "vitest";

import { correctiveActionIssue } from "./incident-issue";

/**
 * Ask Bubbles conv_mvofkkrg2ipw28x, 25 Oct 2026. The manager's turn, with the
 * employee's name swapped for an invented one:
 *
 *   "create ca form for wren calloway, register shortage 10-20-26, $3.25 payroll deduct"
 *
 * The card's Issue read "… register shortage 10-20-26, $3": the point in
 * "$3.25" was taken as the end of a sentence. DECIMAL_KEEP_ENABLED reads it
 * as one number. The payroll clause answers its own field ("Payroll
 * deduction amount: $3.25") and is not the account.
 */
const FLAGS = ["DECIMAL_KEEP_ENABLED", "TYPED_NAME_ENABLED"] as const;
const saved = Object.fromEntries(FLAGS.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of FLAGS) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

const REPORTED = "create ca form for wren calloway, register shortage 10-20-26, $3.25 payroll deduct";
const SENTENCE = "create ca form for wren calloway. wren had a register shortage of $3.25 on 10-20-26. payroll deduct of $3.25 is applicable";
const FOR_CLAUSE = "need a written warning for a register shortage of $3.25 on 10-20-26";

describe("DECIMAL_KEEP_ENABLED off: the Issue is read as on main", () => {
  it("cuts the reported turn at the point in $3.25", () => {
    process.env.TYPED_NAME_ENABLED = "on";
    delete process.env.DECIMAL_KEEP_ENABLED;
    expect(correctiveActionIssue(REPORTED, "wren calloway")).toBe("create ca form for wren calloway, register shortage 10-20-26, $3");
    expect(correctiveActionIssue(FOR_CLAUSE, "wren calloway")).toBe("a register shortage of $3");
  });
});

describe("DECIMAL_KEEP_ENABLED on: $3.25 is one number", () => {
  it("never leaves a cut amount in the reported turn's Issue", () => {
    process.env.TYPED_NAME_ENABLED = "on";
    process.env.DECIMAL_KEEP_ENABLED = "on";
    const issue = correctiveActionIssue(REPORTED, "wren calloway");
    expect(issue).toBe("create ca form for wren calloway, register shortage 10-20-26");
    expect(issue).not.toMatch(/\$3$/);
  });

  it("keeps $3.25 whole in the account sentence and the for-clause", () => {
    process.env.TYPED_NAME_ENABLED = "on";
    process.env.DECIMAL_KEEP_ENABLED = "on";
    expect(correctiveActionIssue(SENTENCE, "wren calloway")).toBe("wren had a register shortage of $3.25 on 10-20-26");
    expect(correctiveActionIssue(FOR_CLAUSE, "wren calloway")).toBe("a register shortage of $3.25 on 10-20-26");
  });

  it("reads the reported turn the same in sentence case", () => {
    process.env.TYPED_NAME_ENABLED = "on";
    process.env.DECIMAL_KEEP_ENABLED = "on";
    expect(correctiveActionIssue("Create ca form for Wren calloway, register shortage 10-20-26, $3.25 payroll deduct", "Wren calloway")).not.toMatch(/\$3$/);
    expect(correctiveActionIssue("Need a written warning for a register shortage of $3.25 on 10-20-26", "wren calloway")).toBe("a register shortage of $3.25 on 10-20-26");
  });

  it("still ends a sentence at a point after a word", () => {
    process.env.TYPED_NAME_ENABLED = "on";
    process.env.DECIMAL_KEEP_ENABLED = "on";
    expect(correctiveActionIssue("ca for wren calloway. she was late on 10-2.", "wren calloway")).toBe("she was late on 10-2");
  });
});
