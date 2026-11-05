import { describe, expect, it } from "vitest";

import { titleNamesAnotherPerson } from "./title-of-another-person";

/** QA, 5 Nov 2026, R2: the store manager's story, every person invented. */
const R2 =
  "verbal warning The date she complained was Oct 31st . The customer said she was giving her an attitude when she brought up that the register was charging for scent in her laundry refills and it has never done that before. When Odessa spoke with District manager Brenna Kowaldane on the phone about how to fix this, Odessa told the customer that she was making her job really hard. The customer reached out to district manager Brenna Kowaldane saying Odessa was very rude to her and Odessa told her she knows how to do her job she has worked here for two years. no payroll deduct.";

describe("TITLE_OF_THE_EMPLOYEE_ENABLED: a title attached to another named person is theirs", () => {
  it("R2: \"District manager Brenna Kowaldane\" (twice) is not Odessa Farrow Lindqvist's title", () => {
    expect(titleNamesAnotherPerson(R2, "District Manager", "Odessa Farrow Lindqvist")).toBe(true);
  });

  it("the employee's own title stays theirs: beside their name, or beside no name", () => {
    expect(titleNamesAnotherPerson("Store Manager Odessa Farrow was late opening", "Store Manager", "Odessa Farrow")).toBe(false);
    expect(titleNamesAnotherPerson("she is an assistant store manager and was late", "Assistant Store Manager", "Odessa Farrow")).toBe(false);
  });

  it("once beside another person and once on its own: not settled, left as before", () => {
    expect(titleNamesAnotherPerson("Odessa is a district manager. She called District manager Brenna Kowaldane.", "District Manager", "Odessa Farrow")).toBe(false);
  });

  it("a title not written out, or no employee: left as before", () => {
    expect(titleNamesAnotherPerson(R2, "Store Manager", "Odessa Farrow Lindqvist")).toBe(false);
    expect(titleNamesAnotherPerson(R2, "District Manager", null)).toBe(false);
  });
});
