import { describe, expect, it } from "vitest";

import { isoDate, readDates } from "./dates";

/**
 * Pau via QA, 23 Nov 2026 (the sibling app's live chat, "show me <first>sexit"): the manager answered "Which one?" with
 * "11202026", a date typed as eight digits. Read as MMDDYYYY where the value IS a date; never inside an account.
 */
describe("isoDate: eight digits typed as a date", () => {
  it("reads MMDDYYYY when the whole value is eight digits and a real day", () => {
    expect(isoDate("11202026", "2026-11-23")).toBe("2026-11-20");
    expect(isoDate(" 01052026 ", "2026-11-23")).toBe("2026-01-05");
  });

  it("is no date when it is not a real day", () => {
    expect(isoDate("13202026", "2026-11-23")).toBeNull();
    expect(isoDate("02302026", "2026-11-23")).toBeNull();
  });

  it("an account's eight-digit number is never read as a date (readDates, the account reader, is unchanged)", () => {
    expect(readDates("her employee number is 11202026")).toEqual([]);
  });

  it("the styles it already read are unchanged", () => {
    expect(isoDate("11/20/2026", "2026-11-23")).toBe("2026-11-20");
    expect(isoDate("2026-11-20", "2026-11-23")).toBe("2026-11-20");
  });
});
