import { afterEach, describe, expect, it } from "vitest";

import { detectTemplateIntent } from "./template-intent";

/**
 * Pau via QA, 5 Nov 2026 (sf-s22 in the sibling app; the manager's turns
 * verbatim, people invented): "Make this:<a reviewer's notes about Corwen>" turned the
 * Corrective Action into a Coaching Form ("Kit Coaching Document" in the
 * notes),.
 */
const NOTES =
  "Please make the following edits and resubmit:\n\n1. **Kit Coaching Document:** This was signed on 10/16/2026. I do not see a date showing that Bundles was signed by Corwen. Please make sure all coaching documents are signed and dated (mm/dd/yyyy format) before uploading.\n\n2. **Details – Observed:** Please reword this section to:\n   \n   For the month of October 2026, Corwen completed 24 transactions and was below expectations in UPT, Average Sale, and Conversion.\n\n3. **Policy Violated:** Please change this from **Under Performance** to **Standards of Conduct**, as the second bullet under that policy is lack of sales performance. You may need to manually add this bullet.";

afterEach(() => {
  delete process.env.PASTED_BLOCK_FORM_ENABLED;
});

describe("PASTED_BLOCK_FORM_ENABLED: a form named only inside pasted notes is not a request", () => {
  it("off, the notes read as a Coaching Form (the reported card)", () => {
    expect(detectTemplateIntent(`Make this:${NOTES}`)).toEqual({ kind: "explicit", templateKey: "coaching" });
  });

  it("on, the lead names no form", () => {
    process.env.PASTED_BLOCK_FORM_ENABLED = "true";
    expect(detectTemplateIntent(`Make this:${NOTES}`).kind).toBe("none");
    expect(detectTemplateIntent(`Use this to make it: ${NOTES}`).kind).toBe("none");
  });

  it("on, a lead that names the form still does; a one-line turn is unchanged", () => {
    process.env.PASTED_BLOCK_FORM_ENABLED = "true";
    expect(detectTemplateIntent(`Create a coaching form for Wynne Sarrow:\n- late 10/5\n- late 10/15\n- late 10/20`)).toMatchObject({ kind: "explicit", templateKey: "coaching" });
    expect(detectTemplateIntent("Create a coaching form: Wynne Sarrow")).toMatchObject({ kind: "explicit", templateKey: "coaching" });
  });
  /*
   * coding 2's 3+3 of the bundle, 5 Nov 2026 (found in the sibling app): on the
   * live path the question is the app's state lines around the manager's turn,
   * and "Policy reference:" on the first line read as a lead ending in a colon,
   * so "create a coaching form for Test Employee, late to her shift on 10-20"
   * opened no card.
   */
  it("on, the app's own lines are no lead: the manager's request still opens its form", () => {
    process.env.PASTED_BLOCK_FORM_ENABLED = "true";
    const live =
      "The employee is Test Employee. Policy reference: Attendance, JBA Policy Manual p.14. Incident: Attendance.\ncreate a coaching form for Test Employee, late to her shift on 10-20\nIt happened on 10/20/2026.";
    expect(detectTemplateIntent(live)).toMatchObject({ kind: "explicit", templateKey: "coaching" });
    expect(detectTemplateIntent(`The employee is Wynne Sarrow.\nMake this:${NOTES}`).kind).toBe("none");
  });
});
