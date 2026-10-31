import { describe, expect, it } from "vitest";

import { asksForSameForm, copiedValues, namedSource } from "./same-form-copy";
import type { LoadedInstance } from "./instances";

/** QA, 30 Oct 2026: the manager's wording. Names are invented. */
describe("reading the request", () => {
  it.each([
    ["Do the same coaching form for remy calder", true, null],
    ["can you create the same draft that we did with marnie holloway by changing the name and position?", true, "marnie holloway"],
    ["same as marnie's please", true, "marnie"],
    ["add details about the rolling rack", false, null],
    ["is this the same policy?", false, null],
  ])("%s", (said, same, named) => {
    expect(asksForSameForm(said)).toBe(same);
    expect(namedSource(said)).toBe(named);
  });
});

describe("what is copied", () => {
  const source = {
    instance: { employeeName: "Marnie Holloway" },
    values: [
      { fieldKey: "employee_name", value: "Marnie Holloway", checked: [] },
      { fieldKey: "job_title", value: "Team Lead", checked: [] },
      { fieldKey: "form_date", value: "2026-10-30", checked: [] },
      { fieldKey: "manager_signature", value: "x", checked: [] },
      { fieldKey: "coaching_details", value: "Observed: Marnie Holloway pins slips. Marnie packs.", checked: [] },
      { fieldKey: "coaching_topics", value: null, checked: ["other"] },
      { fieldKey: "other_topic", value: "Ship from store", checked: [] },
    ],
  } as unknown as LoadedInstance;

  it("the content, renamed; never who, where, when or a signature", () => {
    expect(copiedValues(source, "Remy Calder")).toEqual({
      values: { coaching_details: "Observed: Remy Calder pins slips. Remy packs.", other_topic: "Ship from store" },
      checked: { coaching_topics: ["other"] },
    });
  });
});
