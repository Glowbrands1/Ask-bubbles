import { describe, expect, it } from "vitest";

import { terminationDetails } from "./exit-termination-details";

/* QA's f077 (ported from the sibling app, 20 Nov 2026). Invented name (the loop cases' roster). */
describe("terminationDetails", () => {
  it("takes out a 'gave notice' sentence and says the notice date in the form's terms", () => {
    expect(terminationDetails("Ozren gave notice on 11/17 and the last day worked was 11/18. Ozren was terminated for job abandonment.", "2026-11-17"))
      .toBe("Ozren was terminated for job abandonment. Notice date recorded: 11/17.");
  });
  it("takes out 'resigned' and 'quit' sentences; with no notice date, adds nothing", () => {
    expect(terminationDetails("Ozren resigned. Ozren was terminated after three no call no shows.", null)).toBe("Ozren was terminated after three no call no shows.");
  });
  it("leaves Details with no resignation wording as written", () => {
    const plain = "Ozren was terminated for job abandonment. Keys were returned.";
    expect(terminationDetails(plain, "2026-11-17")).toBe(plain);
  });
});
