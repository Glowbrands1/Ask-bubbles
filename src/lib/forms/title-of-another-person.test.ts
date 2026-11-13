import { afterEach, describe, expect, it, vi } from "vitest";

import { titleNamesAnotherPerson } from "./title-of-another-person";

/** QA, 5 Nov 2026, R2: the store manager's story, every person invented. */
const R2 =
  "verbal warning The date she complained was Oct 31st . The customer said she was giving her an attitude when she brought up that the register was charging for scent in her laundry refills and it has never done that before. When Odessa spoke with District manager Brenna Kowaldane on the phone about how to fix this, Odessa told the customer that she was making her job really hard. The customer reached out to district manager Brenna Kowaldane saying Odessa was very rude to her and Odessa told her she knows how to do her job she has worked here for two years. no payroll deduct.";

afterEach(() => vi.unstubAllEnvs());

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

/*
 * The sibling app's gate, 6 Nov 2026 (s16), in this app's setting: an exit form typed as lines,
 * "<name>\nTeam Member Part Time \nNE Omaha Dodge\n…". The capitalised words on the NEXT line
 * (the store) were read as another person beside the title, so the employee's own Position was
 * dropped. TITLE_ENDS_AT_LINE_ENABLED: a name after a title is on the title's own line. The name is
 * invented (not on the directory).
 */
const S16 =
  "Thessaly Varrow\nTeam Member Part Time \nNE Omaha Dodge\nGave notice - fulfilled notice\nGave notice 9/25/26 - date notice fulfilled 10/9/26\nResigning to pursue other career options\nStore items returned payroll deduction does not apply eligible for rehire";

describe("TITLE_ENDS_AT_LINE_ENABLED: a name beside a title is on the title's own line", () => {
  it("off: the store on the next line is read as another person (the defect)", () => {
    vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "");
    expect(titleNamesAnotherPerson(S16, "Team Member Part Time", "Thessaly Varrow")).toBe(true);
  });

  it("on: the title, alone on its line, is the employee's", () => {
    vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "true");
    expect(titleNamesAnotherPerson(S16, "Team Member Part Time", "Thessaly Varrow")).toBe(false);
  });

  it("on: R2 still reads \"District manager Brenna Kowaldane\" as hers (same line); a typed list's name on the line before still owns the title below it", () => {
    vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "true");
    expect(titleNamesAnotherPerson(R2, "District Manager", "Odessa Farrow Lindqvist")).toBe(true);
    expect(titleNamesAnotherPerson("Rowan Kestrel\nDistrict Manager\nNE Omaha Dodge", "District Manager", "Thessaly Varrow")).toBe(true);
  });
});

describe("TITLE_ENDS_AT_LINE_ENABLED: a title line of capitalised words is one title", () => {
  it("on: \"Team Member\" read from the line \"Team Member Part Time\" is the employee's (\"Part Time\" is not a person)", () => {
    vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "true");
    expect(titleNamesAnotherPerson(S16, "Team Member", "Thessaly Varrow")).toBe(false);
  });
  it("off: as before, \"Part Time\" beside \"Team Member\" reads as another person", () => {
    vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "");
    // FULL_POSITION_TITLE_ENABLED reads "Part Time" as a schedule word (QA, 10 Nov 2026): off here, as this case was written.
    vi.stubEnv("FULL_POSITION_TITLE_ENABLED", "");
    expect(titleNamesAnotherPerson(S16, "Team Member", "Thessaly Varrow")).toBe(true);
  });
});

/* QA's review of the title-line rule, 6 Nov 2026: a DM named on her own line is not a longer title. */
describe("TITLE_ENDS_AT_LINE_ENABLED: a title line is a company position name, never a title and a name", () => {
  it("(a) \"District Manager Brenna Kowaldane\" on its own line is hers, not the employee's above", () => {
    vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "true");
    expect(titleNamesAnotherPerson("Thessaly Varrow\nDistrict Manager Brenna Kowaldane\nNE Omaha Dodge\nGave notice", "District Manager", "Thessaly Varrow")).toBe(true);
  });
  it("(b) \"Team Member Part Time\" on its own line is still the employee's", () => {
    vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "true");
    expect(titleNamesAnotherPerson("Thessaly Varrow\nTeam Member Part Time\nNE Omaha Dodge\nGave notice", "Team Member", "Thessaly Varrow")).toBe(false);
  });
});

/*
 * FULL_POSITION_TITLE_ENABLED (QA, 10 Nov 2026): an exit form typed as lines, "<name>\nTeam Member Weekends Only\n<place>",
 * for an employee with no roster position, left the Job Title blank: "Weekends Only" on the title's line was read as
 * the title's owner. Schedule and status words after the title are no person; a name after it still is (ruling (a)).
 */
describe("schedule and status words after a title are no person (FULL_POSITION_TITLE_ENABLED)", () => {
  const typed = (line: string) => `Isaura Corvadine\n${line} \nNE Omaha Dodge\nGave notice - fulfilled notice`;
  afterEach(() => vi.unstubAllEnvs());

  it("off: \"Weekends Only\" is read as the title's owner, as before (TITLE_ENDS_AT_LINE on)", () => {
    vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "true");
    vi.stubEnv("FULL_POSITION_TITLE_ENABLED", "");
    expect(titleNamesAnotherPerson(typed("Team Member Weekends Only"), "Team Member", "Isaura Corvadine")).toBe(true);
  });

  for (const line of ["Team Member Weekends Only", "Team Member Part-Time", "Team Member - On Call", "Team Member Nights", "Team Member (Seasonal)", "Team Member Closing Shift Only"]) {
    it(`on: "${line}" is the employee's`, () => {
      vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "true");
      vi.stubEnv("FULL_POSITION_TITLE_ENABLED", "true");
      expect(titleNamesAnotherPerson(typed(line), "Team Member", "Isaura Corvadine")).toBe(false);
    });
  }

  it("on: ruling (a) is kept, \"District Manager Brenna Kowaldane\" is hers", () => {
    vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "true");
    vi.stubEnv("FULL_POSITION_TITLE_ENABLED", "true");
    expect(titleNamesAnotherPerson(typed("District Manager Brenna Kowaldane"), "District Manager", "Isaura Corvadine")).toBe(true);
  });

  it("on: a qualifier word inside a name line is still a name (\"Team Member Only Vance\")", () => {
    vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "true");
    vi.stubEnv("FULL_POSITION_TITLE_ENABLED", "true");
    expect(titleNamesAnotherPerson(typed("Team Member Only Vance"), "Team Member", "Isaura Corvadine")).toBe(true);
  });
});
