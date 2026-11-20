import { describe, expect, it } from "vitest";

import { asksWhoDeletedAForm, deletedFormsEmployee, formatFormDeletionsBlock, type FormDeletionRow } from "./form-deletions-chat";

/** Port from Ask Sunny (board f066, 20 Nov 2026): an admin's "who deleted Test Testy's form" reads the deletion record. */
describe("who deleted a form, in chat", () => {
  it("reads the question and the employee it names", () => {
    expect(asksWhoDeletedAForm("who deleted Test Testy's form")).toBe(true);
    expect(deletedFormsEmployee("who deleted Test Testy's form")).toBe("Test Testy");
    expect(deletedFormsEmployee("who deleted test testy's CA draft?")).toBe("test testy");
    expect(asksWhoDeletedAForm("which forms were deleted this week")).toBe(true);
    expect(deletedFormsEmployee("which forms were deleted this week")).toBeNull();
  });

  it("is not a forms or policy turn that says delete", () => {
    expect(asksWhoDeletedAForm("delete that draft")).toBe(false);
    expect(asksWhoDeletedAForm("can I delete a finalized CA?")).toBe(false);
    expect(asksWhoDeletedAForm("write up Test Testy for being late")).toBe(false);
  });

  it("lists who, when and how, and says when the record starts", () => {
    const row: FormDeletionRow = {
      templateName: "Corrective Action Form", employeeName: "Test Testy", formDate: "2026-11-17", status: "draft", locationName: "Test Store",
      deletedBy: "u-quill", deletedByName: "Quill Harrow", deletedByRole: "district_manager", deletedVia: "route", deletedAt: "2026-11-20T15:30:00Z",
    };
    const block = formatFormDeletionsBlock([row, { ...row, deletedBy: null, deletedByName: null, deletedByRole: null, deletedVia: "other" }], "Test Testy");
    expect(block).toMatch(/Corrective Action Form for Test Testy, dated 2026-11-17 \(draft\), Test Store: deleted Nov 20, 2026.* by Quill Harrow \(district_manager\), Forms Register\./);
    expect(block).toMatch(/by not recorded \(deleted outside the app\), outside the app \(directly in the database\)\./);
    expect(block).toContain("The record starts on Nov 20, 2026");
    expect(formatFormDeletionsBlock([], "Test Testy")).toMatch(/No deleted form is on record for Test Testy\. The record starts on Nov 20, 2026/);
  });
});
