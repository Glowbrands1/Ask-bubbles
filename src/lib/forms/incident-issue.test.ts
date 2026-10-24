import { afterEach, describe, expect, it } from "vitest";

import { correctiveActionIssue } from "./incident-issue";

/**
 * 24 Oct 2026 replay, the manager's own sentences. Flags off, the for-clause
 * is the issue, including when it only names the person and the store.
 * Flags on, that clause is not an offense: the account is.
 */
const saved = process.env.TYPED_NAME_ENABLED;

afterEach(() => {
  if (saved === undefined) delete process.env.TYPED_NAME_ENABLED;
  else process.env.TYPED_NAME_ENABLED = saved;
});

const B10 =
  "create a verbal CA for team member Testy Testerson at Dodge, NE. location. On 10-16-26 Testy was not properly measuring and weighing product. payroll deduct is not applicable";
const B9 =
  "create a written corrective action for Team Member, Test Employee. Test was assigned to complete policy acknowledgements in woven by 10-15-26 and failed to meet the deadline. Previous coaching was a Verbal CA 10-1-26. Payroll deduct is not applicable.";
const B12 =
  "do verbal for team member sadie hoffart at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 sadie was not scheduled to work and came into the store to show her team her new puppy. Sadie was in the store 45 min";

describe("correctiveActionIssue keeps the for-clause when a typed name is not in force", () => {
  it("reads cash handling, and a person with no offense as nothing", () => {
    delete process.env.TYPED_NAME_ENABLED;
    expect(correctiveActionIssue("jordan testperson needs a written warning for cash handling", "jordan testperson")).toBe(
      "cash handling",
    );
    expect(correctiveActionIssue("a CA for Jordan Testperson", "Jordan Testperson")).toBeNull();
  });

  it("keeps the person-and-store for-clause", () => {
    delete process.env.TYPED_NAME_ENABLED;
    expect(correctiveActionIssue(B10, "Testy Testerson")).toBe("team member Testy Testerson at Dodge");
  });
});

describe("correctiveActionIssue reads the offense when a typed name is kept", () => {
  it("uses the measuring sentence, then a later 'violation is'", () => {
    process.env.TYPED_NAME_ENABLED = "1";
    expect(correctiveActionIssue(B10, "Testy Testerson")).toMatch(/not properly measuring and weighing product/i);
    const edited = `${B10}\n\nviolation is that on 10-16-26 Testy was not measuring and weighing product`;
    expect(correctiveActionIssue(edited, "Testy Testerson")).toMatch(/not measuring and weighing product/i);
  });

  it("uses the missed-deadline sentence, not the job title", () => {
    process.env.TYPED_NAME_ENABLED = "1";
    const issue = correctiveActionIssue(B9, "Test Employee");
    expect(issue).toMatch(/10-15-26/);
    expect(issue).toMatch(/deadline/i);
    expect(issue).not.toMatch(/team member/i);
  });

  it("keeps the puppy account and the 45 minutes, not the payroll line", () => {
    process.env.TYPED_NAME_ENABLED = "1";
    const issue = correctiveActionIssue(B12, "Sadie Hoffart");
    expect(issue).toMatch(/puppy/i);
    expect(issue).toMatch(/45/);
    expect(issue).not.toMatch(/payroll/i);
  });
});
